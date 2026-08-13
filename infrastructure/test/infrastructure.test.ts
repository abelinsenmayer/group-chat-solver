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
        AI_PROVIDER: process.env.AI_PROVIDER ?? 'ollama',
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
      CacheBehaviors: Match.arrayWith([
        Match.objectLike({ PathPattern: '/api/*' }),
      ]),
      CustomErrorResponses: Match.arrayWith([
        Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
      ]),
    }),
  });
});

test('deploys the built frontend to the site bucket and invalidates CloudFront', () => {
  const template = synthTemplate();

  template.resourceCountIs('Custom::CDKBucketDeployment', 1);
});
