# Browser tests

These tests are written using Node.js, Mocha, and Selenium. The tests launch a
browser, load a Reddit page, and verify that the extension modifies the page as
expected.

## Running tests in Docker

Start the Selenium server:

    docker compose up -d

Run the tests:
    docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm test

When you are done testing, stop the server:

    docker compose down

By default, the tests run in both Firefox and Chrome. You can set the
`SELENIUM_BROWSER` environment variable to specify a single browser.

The tests will run against the build directory for the current manifest
version. To test a different version, you can set `REDEDUP_VERSION`. You can
also test packed artifacts by setting `REDEDUP_BUILD_TYPE=zip` or
`REDEDUP_BUILD_TYPE=signed`. Last, you can specify the exact file to test for
each browser with the `REDEDUP_PATH_FX` or `REDEDUP_PATH_CH` variables.

## Running tests locally

The tests may also be run locally if you have the relevant browsers and
[WebDriver binaries](https://www.selenium.dev/documentation/en/webdriver/driver_requirements/)
installed. Set environment variables as above and run `npm test` to invoke the
tests.

You can disable the browser GUI for Firefox by setting `HEADLESS=true`. This
setting is ignored for the Chrome tests, as Chrome does not support extensions
in headless mode.
