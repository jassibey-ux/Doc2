import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

const spacesEndpoint = new AWS.Endpoint('sfo3.digitaloceanspaces.com');

const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: process.env.ACCESS_KEY,
  secretAccessKey: process.env.SECRET_KEY,
});

export const uploadToSpaces = async (file, folder = 'chat-images') => {
  const fileName = `${Date.now()}-${file.originalname}`;
  const fullPath = `${folder}/${fileName}`;
  
  const params = {
    Bucket: process.env.BUCKET_NAME,
    Key: fullPath,
    Body: file.buffer,
    ACL: 'public-read',
    ContentType: file.mimetype,
  };

  const data = await s3.upload(params).promise();
  return data.Location;
};
