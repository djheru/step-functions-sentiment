import { Comprehend, SESV2 } from 'aws-sdk';
import { ulid } from 'ulid';

type Event = {
  detail: Record<'reviewText', string>;
};

const {
  AWS_REGION: region,
  RECIPIENT: recipient = '',
  SENDER: FromEmailAddress = '',
} = process.env;

const comprehend = new Comprehend({ apiVersion: '2017-11-27' });
const ses = new SESV2({ region });

export const sentimentHandler = async (event: Event) => {
  try {
    console.log('sentimentHandler: %j', event);
    const data = await comprehend
      .detectSentiment({
        LanguageCode: 'en',
        Text: event.detail.reviewText,
      })
      .promise();
    console.log('Sentiment Analysis: %j', data);
    return data;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const idGenerator = async (event: any) => {
  console.log('idGenerator: %j', event);
  const generatedId = ulid();
  console.log(`Generated ID: ${generatedId}`);
  return generatedId;
};

export const negativeSentimentNotification = async (event: any) => {
  try {
    console.log('negativeSentimentNotification: %j', event);
    const message = `
      Sentiment analysis: ${event.sentimentResult.Payload.Sentiment}
      Customer Review: ${event.detail.reviewText}
    `;
    await ses
      .sendEmail({
        FromEmailAddress,
        Destination: {
          ToAddresses: [recipient],
        },
        Content: {
          Simple: {
            Subject: {
              Charset: 'UTF-8',
              Data: 'Negative sentiment customer review',
            },
            Body: {
              Text: {
                Charset: 'UTF-8',
                Data: message,
              },
            },
          },
        },
      })
      .promise();
    return {
      body: 'Notification submitted successfully!',
    };
  } catch (e) {
    console.error(e);
    throw e;
  }
};
