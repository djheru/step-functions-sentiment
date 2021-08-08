import { Comprehend } from 'aws-sdk';
import { ulid } from 'ulid';

type Event = {
  message: string;
};

const comprehend = new Comprehend({ apiVersion: '2017-11-27' });

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
