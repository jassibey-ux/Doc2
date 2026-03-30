import logger from "./logger";
import User from "../models/user";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
// import Body from "../models/bodyparts";
import mongoose from "mongoose";
import nodemailer from 'nodemailer';
const config = require("../../config/Config").get(process.env.NODE_ENV)
const {JWT_SECRET,emailconfig}=config 


export const generateRandomPassword = (length) => {
  const charset = process?.env?.CHAR_SET;
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
};



export const getRandomId = () =>
  {
    const id = Math.floor(Math.random() * 1_000_000_000); // 9-digit number
  return id;
  
  }
  


  export const sendOTPEmail = async (email,html,subject) => {
    logger.debug("sendOTPEmail invoked");

    const transporter = nodemailer.createTransport({
      host: emailconfig.host || 'smtp.gmail.com',
        secure: false,
        port: emailconfig.port,
        auth: {
          user: emailconfig.username,
          pass:  emailconfig.password,
        }
    });

    const mailOptions = {
        from: emailconfig.fromemail,
        to: email,
        subject: subject,
        html: html
    };
    logger.debug({ to: mailOptions.to, subject: mailOptions.subject }, "sending OTP email");

var result=    await transporter.sendMail(mailOptions);
logger.info({ messageId: result?.messageId }, "OTP email sent");

return result;
};

export const sendPasswordSetEmail = async (email,html,subject) => {
  logger.debug("sendPasswordSetEmail invoked");

  const transporter = nodemailer.createTransport({
    host: emailconfig.host || 'smtp.gmail.com',
      secure: false,
      port: emailconfig.port,
      auth: {
        user: emailconfig.username,
        pass:  emailconfig.password,
      }
  });

  const mailOptions = {
    from: emailconfig.fromemail,
    to: email,
    subject: subject,
    html:html
  };
  logger.debug({ to: mailOptions.to, subject: mailOptions.subject }, "sending password set email");

var result=    await transporter.sendMail(mailOptions);
  logger.info({ messageId: result?.messageId }, "password set email sent");

return result;
};  