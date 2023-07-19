const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const AppError = require('../utils/appError');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const sendEmail = require('../utils/email');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;
  res.cookie('jwt', token, cookieOptions);

  res.status(statusCode).json({
    status: 'Success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    role: req.body.role,
  });

  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  console.log(password);

  //1) check if email and password field are present in req.body
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  //2) check if user exist and password is correct
  const user = await User.findOne({ email }).select('+password');
  //correctPassword wala method userModel mai implement kiya hua hai

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Invalid email or password'), 401);
  }

  //3)If everything ok send the token to client
  createSendToken(user, 201, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};

exports.protect = catchAsync(async (req, res, next) => {
  //1) get token and check if its there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  //   console.log(token);
  if (!token) {
    return next(new AppError('You are not logged in! Please log in', 401));
  }
  //2)Verification of token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  // console.log(decoded);
  //3)check if user still exist
  const freshUser = await User.findById(decoded.id);
  if (!freshUser) {
    return next(
      new AppError('The user belonging to this token no longer exists.', 401)
    );
  }
  //check if the user changed password after the token was issued
  if (freshUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('Password recently changed pls login again', 401));
  }

  req.user = freshUser;
  res.locals.user = freshUser;
  next();
});

exports.isLoggedin = async (req, res, next) => {
  if (req.cookies.jwt) {
    try {
      //1) verifies the token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );
      //2) check user still exist
      const freshUser = await User.findById(decoded.id);
      if (!freshUser) {
        return next();
      }
      //3) check if the user changed password after the token was issued
      if (freshUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }
      //There is a logged in user
      res.locals.user = freshUser;
      // console.log(freshUser);
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

exports.restricTo =
  (...roles) =>
  (req, res, next) => {
    // roles ['admin','lead-guide'] role='user'
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }

    next();
  };

exports.forgetPassword = catchAsync(async (req, res, next) => {
  //1) get user based on poseted email

  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with that email address', 404));
  }

  //2)Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  //3)Send the token via email
  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}/api/v1/users/resetPassword/${resetToken}`;

  const message = `Forgot your Password? Click on the link to reset your password.\n${resetURL}`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Password reset link',
      message,
    });

    res.status(200).json({
      status: 'Success',
      message: 'token sent ro email',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError('There was error sending email try again'), 500);
  }
});
exports.resetPassword = catchAsync(async (req, res, next) => {
  //1)get user based on token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({ passwordResetToken: hashedToken });
  //2)If token has not expired , and there is an user, set the new password
  //
  // console.log(user);
  if (user.passwordResetExpires < Date.now() || !user) {
    return next(new AppError('Token is invalid or expired'), 400);
  }

  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  user.passwordResetToken = undefined;
  // user.passwordResetExpires = undefined;
  await user.save();
  //3) update the changedPasswordAt property for the user
  //4) Log the user in , send JWT
  createSendToken(user, 201, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  //1) Get user from collection
  const user = await User.findById(req.user.id).select('+password');

  //2) check if posted current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError('Incorrect Password'));
  }
  //3)If so update pass word
  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  await user.save();
  //4)log in user send jwt
  const token = signToken(user._id);

  res.status(201).json({
    status: 'Success',
    token,
  });
});
