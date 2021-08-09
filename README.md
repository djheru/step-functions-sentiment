# Welcome to your CDK TypeScript project!

This is a blank project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template

## Install EventBridge CLI Tool

```
curl -OL https://github.com/spezam/eventbridge-cli/releases/download/v1.7.0/eventbridge-cli_1.7.0_darwin_amd64.tar.gz
tar xvfz eventbridge-cli_1.7.0_darwin_amd64.tar.gz
mv eventbridge-cli /usr/local/bin
chmod +x /usr/local/bin/eventbridge-cli
```

### Listen for events on a given event bus

```bash
eventbridge-cli --eventbusname SentimentAnalysisReviewsEventBus
```
