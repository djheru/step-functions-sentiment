import { Comprehend } from 'aws-sdk';

type Event = {
  detail: Record<'reviewText', string>;
};

const { AWS_REGION: region } = process.env;

const comprehend = new Comprehend({ apiVersion: '2017-11-27' });

export const handler = async (event: Event) => {
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
