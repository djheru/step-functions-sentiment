import { Comprehend, SESV2 } from 'aws-sdk';
import { ulid } from 'ulid';

type Event = {
  message: string;
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
        Text: event.message,
      })
      .promise();
    console.log('Sentiment Analysis: %j', data);
    return data;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const idGenerator = async () => {
  return ulid();
};

export const negativeSentimentNotification = async (event: any) => {
  try {
    const message = `
      Sentiment analysis: ${event.sentimentResult.Payload.Sentiment}
      Customer Review: ${event.message}
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
