import mongoose from 'mongoose';

const config = require ("./Config")

const db=require('./Config').get(process.env.NODE_ENV).DB;

const mongodburl=`mongodb://${db.HOST}:${db.PORT}/${db.DATABASE}`
// console.log('mongodburl__',mongodburl);


const usecredential={
    user:db.USERNAME,
    pass:db.PASSWORD
} 
export const mongoconnection = async()=>{
    try{
      var data=  await mongoose.connect(mongodburl,usecredential);
        console.log("Database connected successfully");
    }
    catch(e){
        console.log('db-error--->',e)
        throw e.message;
    }
} 