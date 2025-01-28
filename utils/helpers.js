const formatDate = (date) => {
  return new Date(date).toISOString();
};

const generateRandomString = (length) => {
  return Math.random()
    .toString(36)
    .substring(2, length + 2);
};

const calculateTimeLeft = (expiryDate) => {
  const now = new Date().getTime();
  const expiryTime = new Date(expiryDate).getTime();

  return Math.max(0, expiryTime - now);
};

const sanitizeUserData = (user) => {
  const { password, __v, ...sanitizedUser } = user.toObject();
  return sanitizedUser;
};

module.exports = {
  formatDate,
  generateRandomString,
  calculateTimeLeft,
  sanitizeUserData,
};
