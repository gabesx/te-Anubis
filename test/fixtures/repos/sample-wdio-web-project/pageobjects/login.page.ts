class LoginPage {
  get submitButton() {
    return $('[data-testid="login-submit"]');
  }
}

export default new LoginPage();
