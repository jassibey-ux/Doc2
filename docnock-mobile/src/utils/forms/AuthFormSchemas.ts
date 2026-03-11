import * as Yup from 'yup';

// eslint-disable-next-line no-useless-escape
export const email_regex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w\w+)+$/;

const EmailSchema = Yup.string()
  .email('Invalid email')
  .matches(email_regex, 'Invalid email')
  .required('Email is required');
const PasswordSchema = Yup.string().required('Password is required');
const MobileSchema = Yup.string()
  .required('Mobile number is required')
  .min(10, 'Invalid mobile number')
  .max(11, 'Invalid mobile number');

const LoginSchema = Yup.object({
  mobile: MobileSchema,
  password: PasswordSchema,
});
const LoginInitialValues = {
  mobile: '',
  password: '',
};

const VerifyOtpSchema = Yup.object({
  otp: Yup.string().required('OTP is required'),
});
const VerifyOtpInitialValues = {
  otp: '',
};

const SignupSchema = Yup.object({
  fullName: Yup.string().required('Name is required'),
  email: EmailSchema,
  address: Yup.string().required('Location is required'),
  mobile: Yup.string().required('Contact Number is required'),
  newPassword: PasswordSchema,
  // confirmPassword: Yup.string()
  //   .oneOf([Yup.ref('password')], 'Passwords must match')
  //   .required('Please re-enter your password'),
});
const SignupInitialValues = {
  fullName: '',
  email: '',
  address: '',
  mobile: '',
  newPassword: '',
};

const ForgotPasswordSchema = Yup.object({
  email: EmailSchema,
});
const ForgotPasswordInitialValues = {
  email: '',
};

const ResetPasswordSchema = Yup.object({
  password: PasswordSchema,
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords must match')
    .required('Please re-enter your password'),
});
const ResetPasswordInitialValues = {
  password: '',
  confirmPassword: '',
};

export {
  LoginSchema,
  SignupSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  LoginInitialValues,
  SignupInitialValues,
  ForgotPasswordInitialValues,
  ResetPasswordInitialValues,
  VerifyOtpSchema,
  VerifyOtpInitialValues,
};
