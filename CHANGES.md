# Changelog

## Version 1.4
- Auto-save domain settings on each change
- Fix bug preventing processing of search results
- Fix bug with legacy search page handling
- Automated test improvements
    - Add Chrome support
    - Add docker-compose configuration
    - Run tests in both Firefox and Chrome by default
    - Make headless mode optional rather than the default
    - Use a fresh browser instance per test case
    - Make it easier to specify extension path
    - Add mechanism for tests to query info from content script
    - Add test suite for page type
- Ignore blank thumbnails when deduplicating
- Minor fixes and improvements

## Version 1.3

- Add per-domain settings for deduplicating by thumbnail
- Automate basic browser tests using Selenium
- Minor fixes/improvements

## Version 1.2

- Add support for RES "Never Ending Reddit" feature
- Correctly handle legacy search page
- Minor fixes/improvements

## Version 1.1

- Single source of truth for default settings
- Add support for search pages
- Implement wavelet hash algorithm
- Add scaling step in difference hash implementation
- Minor fixes/improvements

## Version 1.0

- Initial release
- Support Firefox and Chrome
- Implement difference hash and DCT hash algorithms
- Settings UI
