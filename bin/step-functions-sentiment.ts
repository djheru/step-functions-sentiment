#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { StepFunctionsSentimentStack } from '../lib/step-functions-sentiment-stack';
import { ApiEventStack } from '../lib/api-event-stack';

const app = new cdk.App();
const stepFunctionsSentimentStack = new StepFunctionsSentimentStack(
  app,
  'SentimentAnalysisWorkflow'
);
new ApiEventStack(app, 'SentimentAnalysis', {
  table: stepFunctionsSentimentStack.reviewsTable,
  eventBus: stepFunctionsSentimentStack.reviewsEventBus,
});
