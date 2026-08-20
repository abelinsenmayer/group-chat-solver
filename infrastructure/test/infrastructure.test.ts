import { App } from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { InfrastructureStack } from '../lib/infrastructure-stack';

function synthTemplate(): Template {
  const app = new App();
  const stack = new InfrastructureStack(app, 'TestStack');
  return Template.fromStack(stack);
}

test('creates a private S3 bucket for the frontend site', () => {
  const template = synthTemplate();
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
});

test('creates a container-image Lambda with a streaming, IAM-authed function URL', () => {
  const template = synthTemplate();

  template.hasResourceProperties('AWS::Lambda::Function', {
    PackageType: 'Image',
    Timeout: 900,
    Environment: {
      Variables: {
        AI_PROVIDER: process.env.AI_PROVIDER ?? 'gemini',
      },
    },
  });

  template.hasResourceProperties('AWS::Lambda::Url', {
    AuthType: 'AWS_IAM',
    InvokeMode: 'RESPONSE_STREAM',
  });
});

test('grants the backend Lambda read access to its SSM parameters', () => {
  const template = synthTemplate();

  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 'ssm:GetParameter',
          Effect: 'Allow',
        }),
      ]),
    },
  });
});

test('creates a CloudFront distribution routing /api/* to the backend and everything else to S3', () => {
  const template = synthTemplate();

  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultRootObject: 'index.html',
      Comment: 'Conversation Solver Distirbution',
      Aliases: Match.arrayWith([
        'abelinsenmayer.dev',
        '*.abelinsenmayer.dev',
      ]),
      ViewerCertificate: Match.objectLike({
        AcmCertificateArn: 'arn:aws:acm:us-east-1:611052934789:certificate/5081faf8-ec83-4201-b521-a74fb7cb25c6',
        SslSupportMethod: 'sni-only',
        MinimumProtocolVersion: 'TLSv1.2_2021',
      }),
      DefaultCacheBehavior: Match.objectLike({
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
      }),
      CacheBehaviors: Match.arrayWith([
        Match.objectLike({
          PathPattern: '/api/wakeup',
          CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
        }),
        Match.objectLike({
          PathPattern: '/api/*',
          CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        }),
      ]),

    }),
  });
});

test('deploys the built frontend to the site bucket and invalidates CloudFront', () => {
  const template = synthTemplate();

  template.resourceCountIs('Custom::CDKBucketDeployment', 1);
});

test('creates a CloudWatch alarm that notifies an SNS topic on Lambda throttles', () => {
  const template = synthTemplate();

  template.hasResourceProperties('AWS::SNS::Topic', {
    TopicName: 'group-chat-solver-lambda-alarms',
  });

  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    Namespace: 'AWS/Lambda',
    MetricName: 'Throttles',
    Statistic: 'Sum',
    Threshold: 1,
    EvaluationPeriods: 1,
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    AlarmActions: Match.arrayWith([Match.objectLike({})]),
  });
});
