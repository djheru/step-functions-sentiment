import { AttributeType, BillingMode, Table } from '@aws-cdk/aws-dynamodb';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { Runtime } from '@aws-cdk/aws-lambda';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { RetentionDays } from '@aws-cdk/aws-logs';
import {
  Choice,
  Condition,
  JsonPath,
  Succeed,
} from '@aws-cdk/aws-stepfunctions';
import {
  DynamoAttributeValue,
  DynamoPutItem,
  LambdaInvoke,
} from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, RemovalPolicy, Stack, StackProps } from '@aws-cdk/core';
import { pascalCase } from 'change-case';

export class StepFunctionsSentimentStack extends Stack {
  public id: string;
  private props: StackProps;

  public sentimentLambda: NodejsFunction;
  public detectSentiment: LambdaInvoke;

  public generateReferenceNumberLambda: NodejsFunction;
  public generateReferenceNumber: LambdaInvoke;

  public feedbackTable: Table;
  public saveFeedback: DynamoPutItem;

  public negativeSentimentNotificationLambda: NodejsFunction;
  public sendSentimentNotification: LambdaInvoke;
  public checkSentimentChoice: Choice;

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

  buildSentimentNotificationLambda() {
    const sendSentimentNotificationId = pascalCase(
      `${this.id}-sentiment-notification`
    );
    const negativeSentimentNotificationLambdaId = pascalCase(
      `${sendSentimentNotificationId}-lambda`
    );
    this.negativeSentimentNotificationLambda = new NodejsFunction(
      this,
      negativeSentimentNotificationLambdaId,
      {
        functionName: negativeSentimentNotificationLambdaId,
        runtime: Runtime.NODEJS_12_X,
        entry: 'src/handlers.ts',
        handler: 'negativeSentimentNotification',
        memorySize: 256,
        logRetention: RetentionDays.ONE_MONTH,
        bundling: {
          nodeModules: ['aws-sdk', 'ulid'],
          externalModules: [],
        },
      }
    );

    this.sendSentimentNotification = new LambdaInvoke(
      this,
      sendSentimentNotificationId,
      {
        lambdaFunction: this.negativeSentimentNotificationLambda,
        resultPath: '$.notifyViaEmail',
      }
    );

    this.checkSentimentChoice = new Choice(this, 'checkSentiment')
      .when(
        Condition.stringEquals(
          '$.sentimentResult.Payload.Sentiment',
          'NEGATIVE'
        ),
        this.sendSentimentNotification
      )
      .otherwise(new Succeed(this, 'positiveSentiment'));
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

  buildFeedbackTable() {
    const feedbackTableId = pascalCase(`${this.id}-feedback-table`);
    const saveFeedbackId = pascalCase(`${this.id}-save-feedback`);
    this.feedbackTable = new Table(this, feedbackTableId, {
      partitionKey: {
        name: 'formId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.saveFeedback = new DynamoPutItem(this, saveFeedbackId, {
      table: this.feedbackTable,
      item: {
        formId: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$.ticketId.Payload')
        ),
        customerMessage: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$.message')
        ),
        sentiment: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$.sentimentResult.Payload.Sentiment')
        ),
      },
      resultPath: '$.formDataRecord',
    });
  }
}
