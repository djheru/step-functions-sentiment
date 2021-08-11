import {
  FieldLogLevel,
  GraphqlApi,
  HttpDataSource,
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

export class ApiEventStack extends Stack {
  public id: string;

  public reviewsEventBus: EventBus;
  public reviewsApi: GraphqlApi;
  public putReviewEventBridgeDataSource: HttpDataSource;

  public reviewsApiUrl: string;
  public reviewsApiKey: string;
  public reviewsApiId: string;
  public reviewsEventBusArn: string;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.id = id;

    this.buildResources();
  }

  buildResources() {
    this.buildEventBus();
    this.buildApi();
    this.buildEventBridgeRole();
    this.buildPutReviewMutation();
    this.buildGetReviewQuery();
    this.buildCfnOutput();
  }

  buildEventBus() {
    const reviewsEventBusId = pascalCase(`${this.id}-reviews-event-bus`);
    this.reviewsEventBus = new EventBus(this, reviewsEventBusId, {
      eventBusName: REVIEWS_EVENT_BUS_NAME,
    });
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
    const appSyncEventBridgeRoleId = pascalCase(
      `${this.id}-appsync-eventbridge-role`
    );
    const appSyncEventBridgeRole = new Role(this, appSyncEventBridgeRoleId, {
      assumedBy: new ServicePrincipal('appsync.amazonaws.com'),
    });
    appSyncEventBridgeRole.addToPolicy(
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
      Table.fromTableName(
        this,
        pascalCase(`${getReviewDynamoDBDataSourceId}-table`),
        REVIEWS_TABLE_NAME
      )
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

  buildCfnOutput() {
    this.reviewsApiUrl = this.reviewsApi.graphqlUrl;
    new CfnOutput(this, 'reviewsApiUrl', { value: this.reviewsApiUrl });

    this.reviewsApiKey = this.reviewsApi.apiKey!;
    new CfnOutput(this, 'reviewsApiKey', { value: this.reviewsApiKey });

    this.reviewsApiId = this.reviewsApi.apiId;
    new CfnOutput(this, 'reviewsApiId', { value: this.reviewsApiId });

    this.reviewsEventBusArn = this.reviewsEventBus.eventBusArn;
    new CfnOutput(this, 'reviewsEventBusArn', {
      value: this.reviewsEventBusArn,
    });
  }
}
