import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';

export class InfrastructureStack extends cdk.Stack {
  public readonly siteBucket: s3.Bucket;
  public readonly backendFunction: lambda.DockerImageFunction;
  public readonly backendFunctionUrl: lambda.FunctionUrl;
  public readonly distribution: cloudfront.Distribution;
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.backendFunction = new lambda.DockerImageFunction(this, 'BackendFunction', {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../backend')),
      memorySize: 1024,
      timeout: cdk.Duration.minutes(15),
      architecture: lambda.Architecture.X86_64,
      environment: {
        AI_PROVIDER: process.env.AI_PROVIDER ?? 'gemini',
      },
    });

    this.backendFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/group-chat-solver/prod/*`,
      ],
    }));

    this.backendFunctionUrl = this.backendFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    // Notifies subscribers (e.g. email, Slack) when the backend Lambda is throttled.
    // Subscriptions aren't managed here; add them out-of-band (e.g. via the console or a
    // separate `sns.Subscription`) once the topic ARN is available.
    this.alarmTopic = new sns.Topic(this, 'LambdaAlarmTopic', {
      topicName: 'group-chat-solver-lambda-alarms',
      displayName: 'Group Chat Solver Lambda Alarms',
    });

    const throttleAlarm = new cloudwatch.Alarm(this, 'BackendFunctionThrottleAlarm', {
      alarmDescription: 'Alerts when the backend Lambda function is throttled.',
      metric: this.backendFunction.metricThrottles({
        period: cdk.Duration.minutes(5),
        statistic: 'sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    throttleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // Our AWS account has a CloudFront pricing plan subscription, which requires every
    // distribution to have a web ACL and — per AWS — that web ACL can't be removed or swapped
    // for a different one while the plan is active; only pay-as-you-go pricing allows that. AWS
    // auto-created and attached "CreatedByCloudFront-db4ee948" to this distribution out of band.
    // Since our CDK code didn't reference it, CloudFormation's desired state had no WebACLId and
    // tried to remove it on deploy, which CloudFront rejects. Creating a *new* web ACL and
    // attaching it hits the same rejection (that's a swap too) — the only accepted value is this
    // exact, already-associated web ACL, so we reference it by ARN instead of managing it here.
    const existingPricingPlanWebAclArn = cdk.Arn.format(
      {
        service: 'wafv2',
        region: 'us-east-1',
        resource: 'global/webacl',
        resourceName: 'CreatedByCloudFront-db4ee948/a353fb4b-c215-4780-8326-6b2e4ce9db55',
      },
      this,
    );

    const siteCertificate = acm.Certificate.fromCertificateArn(
      this,
      'SiteCertificate',
      'arn:aws:acm:us-east-1:611052934789:certificate/5081faf8-ec83-4201-b521-a74fb7cb25c6',
    );

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      comment: 'Conversation Solver Distirbution',
      webAclId: existingPricingPlanWebAclArn,
      domainNames: ['abelinsenmayer.dev', '*.abelinsenmayer.dev'],
      certificate: siteCertificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      sslSupportMethod: cloudfront.SSLMethod.SNI,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: origins.FunctionUrlOrigin.withOriginAccessControl(this.backendFunctionUrl, {
            // SSE runs can be idle while LangGraph/LLM work is happening. Keep the
            // CloudFront->Lambda connection alive long enough for those gaps.
            readTimeout: cdk.Duration.seconds(60),
            keepaliveTimeout: cdk.Duration.seconds(60),
            responseCompletionTimeout: cdk.Duration.minutes(15),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },

    });

    // origins.FunctionUrlOrigin.withOriginAccessControl() only grants CloudFront's OAC
    // lambda:InvokeFunctionUrl. When the distribution invokes the function via the Lambda
    // integration (rather than the Function URL directly), it needs lambda:InvokeFunction too,
    // scoped to this specific distribution.
    this.backendFunction.addPermission('AllowCloudFrontServicePrincipalInvokeFunction', {
      action: 'lambda:InvokeFunction',
      principal: new iam.ServicePrincipal('cloudfront.amazonaws.com'),
      sourceArn: `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: this.siteBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
  }
}
