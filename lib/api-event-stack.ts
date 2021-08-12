import {
  FieldLogLevel,
  GraphqlApi,
  HttpDataSource,
  KeyCondition,
  MappingTemplate,
  Schema,
} from '@aws-cdk/aws-appsync';
import { Table } from '@aws-cdk/aws-dynamodb';
import { EventBus } from '@aws-cdk/aws-events';
import { PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { CfnOutput, Construct, Stack, StackProps } from '@aws-cdk/core';
import { pascalCase } from 'change-case';
import { join } from 'path';

const { REVIEWS_EVENT_BUS_NAME = '', REVIEWS_TABLE_NAME = '' } = process.env;
export interface ApiEventStackProps extends StackProps {
  table: Table;
  eventBus: EventBus;
}
export class ApiEventStack extends Stack {
  public id: string;
  public reviewsTable: Table;

  public reviewsEventBus: EventBus;
  public reviewsApi: GraphqlApi;
  public putReviewEventBridgeDataSource: HttpDataSource;

  public reviewsApiUrl: string;
  public reviewsApiKey: string;
  public reviewsApiId: string;
  public reviewsEventBusArn: string;

  constructor(scope: Construct, id: string, props: ApiEventStackProps) {
    super(scope, id, props);

    this.id = id;
    this.reviewsTable = props.table;
    this.reviewsEventBus = props.eventBus;

    this.buildResources();
  }

  buildResources() {
    this.buildApi();
    this.buildEventBridgeRole();
    this.buildPutReviewMutation();
    this.buildGetReviewQuery();
    this.buildGetReviewsBySentimentQuery();
    this.buildCfnOutput();
  }

  buildApi() {
    const reviewsApiId = pascalCase(`${this.id}-reviews-api`);
    this.reviewsApi = new GraphqlApi(this, reviewsApiId, {
      name: reviewsApiId,
      schema: Schema.fromAsset(
        join(__dirname, '..', 'graphql', 'schema.graphql')
      ),
      xrayEnabled: true,
      logConfig: {
        excludeVerboseContent: false,
        fieldLogLevel: FieldLogLevel.ALL,
      },
    });
  }

  buildEventBridgeRole() {
    const appSyncRoleId = pascalCase(`${this.id}-appsync-eventbridge-role`);
    const appSyncRole = new Role(this, appSyncRoleId, {
      assumedBy: new ServicePrincipal('appsync.amazonaws.com'),
    });
    appSyncRole.addToPolicy(
      new PolicyStatement({
        resources: ['*'],
        actions: ['events:PutEvents'],
      })
    );
  }

  buildPutReviewMutation() {
    const endpoint = `https://events.${this.region}.amazonaws.com/`;
    const signingRegion = this.region;
    const signingServiceName = 'events';
    const authorizationConfig = { signingRegion, signingServiceName };
    const putReviewEventBridgeDataSourceId = pascalCase(
      `${this.id}-put-review-ds`
    );
    const putReviewEventBridgeDataSource = this.reviewsApi.addHttpDataSource(
      putReviewEventBridgeDataSourceId,
      endpoint,
      { authorizationConfig }
    );

    this.reviewsEventBus.grantPutEventsTo(
      putReviewEventBridgeDataSource.grantPrincipal
    );

    putReviewEventBridgeDataSource.createResolver({
      typeName: 'Mutation',
      fieldName: 'putReview',
      requestMappingTemplate: MappingTemplate.fromFile(
        join(__dirname, '../templates', 'put-review-request.vtl')
      ),
      responseMappingTemplate: MappingTemplate.fromFile(
        join(__dirname, '../templates', 'put-review-response.vtl')
      ),
    });
  }

  buildGetReviewQuery() {
    const getReviewDynamoDBDataSourceId = pascalCase(
      `${this.id}-get-review-ds`
    );
    const getReviewDynamoDBDataSource = this.reviewsApi.addDynamoDbDataSource(
      getReviewDynamoDBDataSourceId,
      this.reviewsTable
    );

    getReviewDynamoDBDataSource.createResolver({
      typeName: 'Query',
      fieldName: 'getReview',
      requestMappingTemplate: MappingTemplate.dynamoDbGetItem(
        'reviewId',
        'reviewId'
      ),
      responseMappingTemplate: MappingTemplate.dynamoDbResultItem(),
    });
  }

  buildGetReviewsBySentimentQuery() {
    const getReviewsBySentimentDynamoDBDataSourceId = pascalCase(
      `${this.id}-get-reviews-by-sentiment-ds`
    );
    const getReviewsBySentimentDynamoDBDataSource =
      this.reviewsApi.addDynamoDbDataSource(
        getReviewsBySentimentDynamoDBDataSourceId,
        this.reviewsTable
      );

    getReviewsBySentimentDynamoDBDataSource.createResolver({
      typeName: 'Query',
      fieldName: 'getReviewsBySentiment',
      requestMappingTemplate: MappingTemplate.dynamoDbQuery(
        KeyCondition.eq('sentiment', 'sentiment'),
        'SentimentAnalysisWorkflowSentimentIndex'
      ),
      responseMappingTemplate: MappingTemplate.dynamoDbResultList(),
    });
  }

  buildCfnOutput() {
    this.reviewsApiUrl = this.reviewsApi.graphqlUrl;
    new CfnOutput(this, 'reviewsApiUrl', { value: this.reviewsApiUrl });

    this.reviewsApiKey = this.reviewsApi.apiKey!;
    new CfnOutput(this, 'reviewsApiKey', { value: this.reviewsApiKey });

    this.reviewsApiId = this.reviewsApi.apiId;
    new CfnOutput(this, 'reviewsApiId', { value: this.reviewsApiId });
  }
}
