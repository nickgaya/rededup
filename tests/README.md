# Browser tests

These tests are written using Node.js, Mocha, and Selenium. The tests launch a
browser, load a Reddit page, and verify that the extension modifies the page as
expected.

## Running tests in Docker

Start the Selenium server:

    docker compose up -d

Set environment variables specifying the extension path for each browser:

    export REDEDUP_PATH_FX=../build/rededup-<version>/firefox
    export REDEDUP_PATH_CH=../build/rededup-<version>/chrome

Run the tests:
    docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm test

By default, the tests run in both Firefox and Chrome. You can set the
`SELENIUM_BROWSER` environment variable to specify a single browser.

When you are done testing, stop the server:

    docker compose down

## Running tests locally

The tests may also be run locally if you have the relevant browsers and
[WebDriver binaries](https://www.selenium.dev/documentation/en/webdriver/driver_requirements/)
installed.

Set environment variables as above and run `npm test` to invoke the tests.

By default, the Firefox tests run in "headless" mode. To enable the browser
GUI, set `HEADLESS=false` in your environment. Chrome does not support
extensions in headless mode so the Chrome tests always run with the GUI
enabled.
