# Browser tests

These tests are written using Node.js, Mocha, and Selenium. The tests launch a
browser, load a Reddit page, and verify that the extension modifies the page as
expected.

## Running tests in Docker

To run the tests using docker, first start the Selenium server

    docker compose up -d

To run the tests for Firefox:

    export SELENIUM_BROWSER=firefox
    export REDEDUP_PATH_FX=/build/rededup-<version>/firefox
    docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm test

For Chrome:

    export SELENIUM_BROWSER=chrome
    export REDEDUP_PATH_CH=/build/rededup-<version>/chrome
    docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm test

## Running tests locally

To run the tests locally for a given browser, you must have the relevant
[WebDriver binary](https://www.selenium.dev/documentation/en/webdriver/driver_requirements/)
installed.

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
