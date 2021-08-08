import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { Runtime } from '@aws-cdk/aws-lambda';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { LambdaInvoke } from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, Stack, StackProps } from '@aws-cdk/core';
import { pascalCase } from 'change-case';

export class StepFunctionsSentimentStack extends Stack {
  public id: string;
  private props: StackProps;

  public sentimentLambda: NodejsFunction;
  public detectSentiment: LambdaInvoke;

  public generateReferenceNumberLambda: NodejsFunction;
  public generateReferenceNumber: LambdaInvoke;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.id = id;
    this.props = props;
  }

  buildSentimentLambda() {
    const detectSentimentId = pascalCase(`${this.id}-sentiment`);
    const sentimentLambdaId = pascalCase(`${detectSentimentId}-lambda`);

    // Lambda function that invokes the Comprehend service
    this.sentimentLambda = new NodejsFunction(this, sentimentLambdaId, {
      functionName: sentimentLambdaId,
      runtime: Runtime.NODEJS_12_X,
      entry: 'src/handlers.ts',
      handler: 'sentimentHandler',
      memorySize: 256,
      logRetention: RetentionDays.ONE_MONTH,
      bundling: {
        nodeModules: ['aws-sdk', 'ulid'],
        externalModules: [],
      },
    });

    // IAM permissions to allow the lambda to invoke Comprehend
    const allowComprehend = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['comprehend:DetectSentiment'],
      resources: ['*'],
    });
    this.sentimentLambda.addToRolePolicy(allowComprehend);

    // Task for the step function
    this.detectSentiment = new LambdaInvoke(this, detectSentimentId, {
      lambdaFunction: this.sentimentLambda,
      resultPath: '$.sentimentResult',
    });
  }

  buildIdGeneratorLambda() {
    const generateReferenceNumberId = pascalCase(`${this.id}-generate-id`);
    const generateReferenceNumberLambdaId = pascalCase(
      `${generateReferenceNumberId}-lambda`
    );

    this.generateReferenceNumberLambda = new NodejsFunction(
      this,
      generateReferenceNumberLambdaId,
      {
        functionName: generateReferenceNumberLambdaId,
        runtime: Runtime.NODEJS_12_X,
        entry: 'src/handlers.ts',
        handler: 'idGenerator',
        memorySize: 256,
        logRetention: RetentionDays.ONE_MONTH,
        bundling: {
          nodeModules: ['aws-sdk', 'ulid'],
          externalModules: [],
        },
      }
    );

    this.generateReferenceNumber = new LambdaInvoke(
      this,
      generateReferenceNumberId,
      {
        lambdaFunction: this.generateReferenceNumberLambda,
        resultPath: '$.ticketId',
      }
    );
  }
}
