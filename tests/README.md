# Selenium tests

These tests are written using Node.js and Selenium. They require Firefox and
gecko-webdriver to be installed on your system.

To run the tests:

    export REDEDUP_PATH=../artifacts/rededup-<version>-fx.zip
    npm test

By default, the tests run in "headless" mode. To enable the browser GUI, you
can set the environment variable `BROWSER_GUI=true`.
