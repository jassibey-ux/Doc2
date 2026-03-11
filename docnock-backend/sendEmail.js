import "dotenv/config";
import sgMail from "@sendgrid/mail";

console.log("SENDGRID_KEY : ", process.env.SENDGRID_KEY);

const msg = {
  to: "recipient@yopmail.com",
  from: "your-verified-sender@example.com",
  subject: "Test Email from SendGrid",
  text: "This is a test email.",
  html: "<strong>This is a test email.</strong>",
};

sgMail
  .send(msg)
  .then(() => {
    console.log("Email sent successfully");
  })
  .catch((error) => {
    console.error("Error sending email:", error);
  });
