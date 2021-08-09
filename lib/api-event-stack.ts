import {
  FieldLogLevel,
  GraphqlApi,
  HttpDataSource,
  MappingTemplate,
  Schema,
} from '@aws-cdk/aws-appsync';
import { EventBus } from '@aws-cdk/aws-events';
import { PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { CfnOutput, Construct, Stack, StackProps } from '@aws-cdk/core';
import { pascalCase } from 'change-case';
import { join } from 'path';

export class ApiEventStack extends Stack {
  public id: string;

  public reviewsEventBus: EventBus;
  public reviewsApi: GraphqlApi;
  public eventBridgeDataSource: HttpDataSource;

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
    this.buildEventBridgeDataSource();
    this.buildEventBridgeResolver();
    this.buildCfnOutput();
  }

  buildEventBus() {
    const reviewsEventBusId = pascalCase(`${this.id}-reviews-event-bus`);
    this.reviewsEventBus = new EventBus(this, reviewsEventBusId, {
      eventBusName: reviewsEventBusId,
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

  buildEventBridgeDataSource() {
    const endpoint = `https://events.${this.region}.amazonaws.com/`;
    const eventBridgeDataSourceId = pascalCase(
      `${this.id}-event-bridge-datasource`
    );
    this.eventBridgeDataSource = this.reviewsApi.addHttpDataSource(
      eventBridgeDataSourceId,
      endpoint,
      {
        authorizationConfig: {
          signingRegion: this.region,
          signingServiceName: 'events',
        },
      }
    );
    this.reviewsEventBus.grantPutEventsTo(
      this.eventBridgeDataSource.grantPrincipal
    );
  }

  buildEventBridgeResolver() {
    this.eventBridgeDataSource.createResolver({
      typeName: 'Mutation',
      fieldName: 'putReview',
      requestMappingTemplate: MappingTemplate.fromFile(
        join(__dirname, '..', 'templates', 'request.vtl')
      ),
      responseMappingTemplate: MappingTemplate.fromFile(
        join(__dirname, '..', 'templates', 'response.vtl')
      ),
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
