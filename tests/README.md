# Browser tests

These tests are written using Node.js and Selenium. To run the tests for a
given browser, you must have the relevant
[WebDriver binary](https://www.selenium.dev/documentation/en/webdriver/driver_requirements/)
installed.

Install test dependencies:

    npm install

Run the tests for Firefox:

    export REDEDUP_PATH_FX=../build/rededup-<version>/firefox
    npm test

By default, the tests run with the browser in "headless" mode. To enable the
GUI set `HEADLESS=false` in your environment.

Run the tests for Chrome:

    export REDEDUP_PATH_CH=../build/rededup-<version>/chrome
    SELENIUM_BROWSER=chrome npm test

Chrome does not support extensions in headless mode, so the tests run with the
GUI visible.
