const { cleanEnv, str, port, num, bool } = require('envalid');

function validateEnv() {
  return cleanEnv(process.env, {
    NODE_ENV: str({ default: 'development', choices: ['development', 'test', 'production'] }),
    PORT: port({ default: 3000 }),
    SITE_URL: str({ default: '' }),
    SESSION_SECRET: str({ desc: 'Session secret; must be long/random in production', default: '' }),
    ADMIN_ACCESS_TOKEN: str({ default: '' }),
    DB_HOST: str({ default: 'localhost' }),
    DB_PORT: port({ default: 3306 }),
    DB_USER: str({ default: '' }),
    DB_PASSWORD: str({ default: '' }),
    DB_NAME: str({ default: '' }),
    CLEAR_SESSIONS_ON_START: bool({ default: false }),
    DISABLE_VIEW_CACHE: bool({ default: false }),
  });
}

module.exports = { validateEnv };
