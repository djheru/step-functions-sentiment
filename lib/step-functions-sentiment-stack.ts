import { AttributeType, BillingMode, Table } from '@aws-cdk/aws-dynamodb';
import { EventBus, Rule } from '@aws-cdk/aws-events';
import { SfnStateMachine } from '@aws-cdk/aws-events-targets';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { Runtime } from '@aws-cdk/aws-lambda';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs';
import {
  Chain,
  Choice,
  Condition,
  JsonPath,
  StateMachine,
  StateMachineType,
  Succeed,
} from '@aws-cdk/aws-stepfunctions';
import {
  DynamoAttributeValue,
  DynamoPutItem,
  LambdaInvoke,
} from '@aws-cdk/aws-stepfunctions-tasks';
import {
  Construct,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from '@aws-cdk/core';
import { pascalCase } from 'change-case';
import * as dotenv from 'dotenv';

dotenv.config();

const { SENDER = '', RECIPIENT = '' } = process.env;

export interface StepFunctionsSentimentStackProps extends StackProps {
  eventBus: EventBus;
}

export class StepFunctionsSentimentStack extends Stack {
  public id: string;
  public eventBus: EventBus;

  public sentimentAnalysis: StateMachine;
  public sentimentAnalysisDefinition: Chain;

  public sentimentLambda: NodejsFunction;
  public detectSentiment: LambdaInvoke;

  public generateReferenceNumberLambda: NodejsFunction;
  public generateReferenceNumber: LambdaInvoke;

  public reviewTable: Table;
  public saveReview: DynamoPutItem;

  public negativeSentimentNotificationLambda: NodejsFunction;
  public sendSentimentNotification: LambdaInvoke;

  public checkSentimentChoice: Choice;

  public sentimentAnalysisTrigger: SfnStateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: StepFunctionsSentimentStackProps
  ) {
    super(scope, id, props);

    this.id = id;
    this.eventBus = props.eventBus;

    this.buildResources();
  }

  buildResources() {
    this.buildSentimentLambda();
    this.buildIdGeneratorLambda();
    this.buildReviewTable();
    this.buildSentimentNotificationLambda();
    this.buildWorkflow();
    this.buildEventTrigger();
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
        resultPath: '$.reviewId',
      }
    );
  }

  buildReviewTable() {
    const reviewTableId = pascalCase(`${this.id}-review-table`);
    const saveReviewId = pascalCase(`${this.id}-save-review`);
    this.reviewTable = new Table(this, reviewTableId, {
      partitionKey: {
        name: 'reviewId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const sentimentIndexId = pascalCase(`${this.id}-sentiment-index`);
    this.reviewTable.addGlobalSecondaryIndex({
      indexName: sentimentIndexId,
      partitionKey: {
        name: 'sentiment',
        type: AttributeType.STRING,
      },
    });

    this.saveReview = new DynamoPutItem(this, saveReviewId, {
      table: this.reviewTable,
      item: {
        reviewId: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$.reviewId.Payload')
        ),
        customerMessage: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$.detail.reviewText')
        ),
        sentiment: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$.sentimentResult.Payload.Sentiment')
        ),
      },
      resultPath: '$.reviewDataRecord',
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
    this.negativeSentimentNotificationLambda.addEnvironment('SENDER', SENDER);
    this.negativeSentimentNotificationLambda.addEnvironment(
      'RECIPIENT',
      RECIPIENT
    );
    this.negativeSentimentNotificationLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ses:SendEmail'],
        resources: ['*'],
      })
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

  buildWorkflow() {
    this.sentimentAnalysisDefinition = this.detectSentiment
      .next(this.generateReferenceNumber)
      .next(this.saveReview)
      .next(this.checkSentimentChoice);

    const sentimentAnalysisId = pascalCase(`${this.id}-sentiment-analysis`);
    this.sentimentAnalysis = new StateMachine(this, sentimentAnalysisId, {
      definition: this.sentimentAnalysisDefinition,
      stateMachineType: StateMachineType.EXPRESS,
      timeout: Duration.seconds(30),
      logs: {
        destination: new LogGroup(this, `${sentimentAnalysisId}-logs`, {
          retention: RetentionDays.ONE_WEEK,
        }),
      },
    });

    this.reviewTable.grantWriteData(this.sentimentAnalysis);
  }

  buildEventTrigger() {
    const sentimentAnalysisRuleId = pascalCase(
      `${this.id}-sentiment-analysis-trigger`
    );
    this.sentimentAnalysisTrigger = new SfnStateMachine(this.sentimentAnalysis);

    new Rule(this, sentimentAnalysisRuleId, {
      eventBus: this.eventBus,
      targets: [this.sentimentAnalysisTrigger],
      eventPattern: {
        detailType: ['SentimentAnalysisReview'], // Matching value in request.vtl
      },
    });
  }
}
