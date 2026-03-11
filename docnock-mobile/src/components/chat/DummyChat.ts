export const STATIC_IMAGE_URI =
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSGw8VE1TljhLuSfX9t6ekDx4ZO1671qZlBrg&s';

export type ChatItem = {
  sender: string;
  message: string;
  timestamp: string;
  date: Date;
  documents?: { uri: string }[];
  recording?: string;
  images?: { uri: string }[];
};

export const chatItems: ChatItem[] = [
  {
    sender: 'John',
    message: 'Hi!',
    timestamp: '10:00',
    date: new Date('2023-05-26 10:00:00'),
  },
  {
    sender: 'Sam',
    message: 'Hi!',
    timestamp: '10:15',
    date: new Date('2023-05-26 10:15:00'),
  },
  {
    sender: 'John',
    message: 'How are you Mr.',
    timestamp: '10:18',
    date: new Date('2023-05-26 10:18:00'),
  },
  {
    sender: 'John',
    message: 'Sam',
    timestamp: '10:18',
    date: new Date('2023-05-26 10:18:00'),
  },
  {
    sender: 'Sam',
    message: 'I am fine now! what about you',
    timestamp: '10:20',
    date: new Date('2023-05-26 10:20:00'),
  },
  {
    sender: 'John',
    message: 'hello! Can you send the document file of Mr. George',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025)
    documents: [{ uri: 'sample uri here' }],
  },
  {
    sender: 'Sam',
    message: 'I will send the document',
    timestamp: '02:00',
    date: new Date('2025-03-14 02:00:00'), // Today's date (March 14, 2025)
    documents: [{ uri: 'sample uri here' }, { uri: 'sample uri here' }, { uri: 'sample uri here' }],
  },
  {
    sender: 'John',
    message: 'Ok, Thanks',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025)
    documents: [
      { uri: 'sample uri here' },
      { uri: 'sample uri here' },
      { uri: 'sample uri here' },
      { uri: 'sample uri here' },
      { uri: 'sample uri here' },
    ],
  },
  {
    sender: 'John',
    message: 'Hi!',
    timestamp: '10:00',
    date: new Date('2023-05-26 10:00:00'),
    recording: 'sample uri here',
  },
  {
    sender: 'Sam',
    message: 'Hi!',
    timestamp: '10:15',
    date: new Date('2023-05-26 10:15:00'),
    recording: 'sample uri here',
  },
  {
    sender: 'John',
    message: 'How are you Mr.',
    timestamp: '10:18',
    date: new Date('2023-05-26 10:18:00'),
    images: [
      { uri: STATIC_IMAGE_URI },
      { uri: STATIC_IMAGE_URI },
      { uri: STATIC_IMAGE_URI },
      { uri: STATIC_IMAGE_URI },
      { uri: STATIC_IMAGE_URI },
      { uri: STATIC_IMAGE_URI },
    ],
  },
  {
    sender: 'Sam',
    message: 'I am fine now! what about you',
    timestamp: '10:20',
    date: new Date('2023-05-26 10:20:00'),
    images: [
      { uri: STATIC_IMAGE_URI },
      { uri: STATIC_IMAGE_URI },
      { uri: STATIC_IMAGE_URI },
      { uri: STATIC_IMAGE_URI },
      { uri: STATIC_IMAGE_URI },
    ],
  },
  {
    sender: 'John',
    message: 'hello! Can you send the document file of Mr. George',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025)
    images: [{ uri: STATIC_IMAGE_URI }],
  },
  {
    sender: 'Sam',
    message: 'I will send the document',
    timestamp: '02:00',
    date: new Date('2025-03-14 02:00:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'John',
    message: 'Ok, Thanks',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'John',
    message: 'Hi!',
    timestamp: '10:00',
    date: new Date('2023-05-26 10:00:00'),
  },
  {
    sender: 'Sam',
    message: 'Hi!',
    timestamp: '10:15',
    date: new Date('2023-05-26 10:15:00'),
  },
  {
    sender: 'John',
    message: 'How are you Mr.',
    timestamp: '10:18',
    date: new Date('2023-05-26 10:18:00'),
  },
  {
    sender: 'Sam',
    message: 'I am fine now! what about you',
    timestamp: '10:20',
    date: new Date('2023-05-26 10:20:00'),
  },
  {
    sender: 'John',
    message: 'hello! Can you send the document file of Mr. George',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'Sam',
    message: 'I will send the document',
    timestamp: '02:00',
    date: new Date('2025-03-14 02:00:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'John',
    message: 'Ok, Thanks',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'John',
    message: 'Hi!',
    timestamp: '10:00',
    date: new Date('2023-05-26 10:00:00'),
  },
  {
    sender: 'Sam',
    message: 'Hi!',
    timestamp: '10:15',
    date: new Date('2023-05-26 10:15:00'),
  },
  {
    sender: 'John',
    message: 'How are you Mr.',
    timestamp: '10:18',
    date: new Date('2023-05-26 10:18:00'),
  },
  {
    sender: 'Sam',
    message: 'I am fine now! what about you',
    timestamp: '10:20',
    date: new Date('2023-05-26 10:20:00'),
  },
  {
    sender: 'John',
    message: 'hello! Can you send the document file of Mr. George',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'Sam',
    message: 'I will send the document',
    timestamp: '02:00',
    date: new Date('2025-03-14 02:00:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'John',
    message: 'Ok, Thanks',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'John',
    message: 'Hi!',
    timestamp: '10:00',
    date: new Date('2023-05-26 10:00:00'),
  },
  {
    sender: 'Sam',
    message: 'Hi!',
    timestamp: '10:15',
    date: new Date('2023-05-26 10:15:00'),
  },
  {
    sender: 'John',
    message: 'How are you Mr.',
    timestamp: '10:18',
    date: new Date('2023-05-26 10:18:00'),
  },
  {
    sender: 'Sam',
    message: 'I am fine now! what about you',
    timestamp: '10:20',
    date: new Date('2023-05-26 10:20:00'),
  },
  {
    sender: 'John',
    message: 'hello! Can you send the document file of Mr. George',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'Sam',
    message: 'I will send the document',
    timestamp: '02:00',
    date: new Date('2025-03-14 02:00:00'), // Today's date (March 14, 2025)
  },
  {
    sender: 'John',
    message: 'Ok, Thanks',
    timestamp: '02:10',
    date: new Date('2025-03-14 02:10:00'), // Today's date (March 14, 2025),
    documents: [{ uri: STATIC_IMAGE_URI }],
  },
];
