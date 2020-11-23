# Test strategy

## Exploratory tests

These tests are intended to verify that the extension subjectively behaves as
expected without disrupting normal functionality of the site.

It is recommended to perform these tests with "Show thumbnail hashes" enabled
in the extension settings, as this helps to verify that the extension is
working even when there are no duplicates on the page.

1. Front page

    1. Navigate to https://old.reddit.com/.

    2. Verify that the page functions as usual.

    3. Open the console, filter to rededup.js and verify that there are no
       errors. There should be two log messages: "Processing X links" and "No
       duplicates found" or "Found Y items with Z total duplicates".

    4. If there are any duplicates (unlikely for the front page), verify that
       the duplicate show/hide behavior works as expected.

2. Subreddit

    1. Navigate to a subreddit page.

    2. Repeat the steps for the front page.

3. Multireddit

    1. Navigate to a multireddit that contains duplicate posts, such as
       https://old.reddit.com/r/illustration+drawing or
       https://old.reddit.com/r/news+worldnews.

    2. Repeat the steps for the front page.

4. User page

    1. Find a user with duplicate posts (look on art-related subs like /r/IDAP
       or /r/Illustration).

    2. Verify that duplicates are handled as expected on the user's overview
       page and submissions page.

    3. Verify that the user comments page work as usual (log message "No links
       found").

5. Post comments

    1. Find a link that has been posted more than once (look on /r/news or
       similar).

    2. Navigate to the post comments and verify the page works as usual.
       (The extension will log "Processing 1 link", "No duplicates found".)

    3. Click on the "Other Discussions" tab and verify that the page works as
       usual. The extension should log "Other Discussions page" and not process
       any links.

## Functionality

These tests use specific posts to verify the deduplication functionality.

1. Deduplicate by thumbnail

    1. Navigate to https://old.reddit.com/by_id/t3_jrjed7,t3_jrqhj4,t3_jo1qwh,t3_jri2y8.

    2. Verify that posts are collated as expected.

        * Post order should be jrjed7, jrqhj4, jri2y8, jo1qwh.
        * jrjed7 should have "(2 duplicates — show)" at end of tagline.
        * jrqhj4 and jri2y8 should be hidden (inline style "display: none").
        * jo1qwh should not be modified.

    3. Verify that show/hide link works as expected.
        * Clicking "show" link should reveal jrqhj4 and jri2y8 and update
          tagline to "hide".
        * Clicking "hide" link should hide jrqhj4 and jri2y8 and update tagline
          to "show".

2. Deduplicate by URL

    1. Navigate to https://old.reddit.com/by_id/t3_jyu5b2,t3_jysgvx,t3_jyu73g.

    2. Verify that posts are collated as expected.

        * Post order should be jyu5b2, jyu73g, jysgvx.
        * jyu5b2 should have "(1 duplicate — show)" at end of tagline.
        * jyu73g should be hidden.

    3. Verify that show/hide link works as expected.

4. Deduplicate by URL (crosspost)

    1. Navigate to https://old.reddit.com/by_id/t3_jyu5b2,t3_jyvuiz.

    2. Verify that posts are collated as expected.

        * Post order should be jyu5b2, jyvuiz.
        * jyu5b2 should have "(1 duplicate — show)" at end of tagline.
        * jyvuiz should be hidden.

    3. Verify that show/hide link works as expected.

4. Deduplicate multiple

    1. Navigate to https://old.reddit.com/by_id/t3_jrjed7,t3_jysgvx,t3_jyu5b2,t3_jrqhj4,t3_jo1qwh,t3_jyu73g,t3_jri2y8,t3_jyvuiz.

    2. Verify that posts are collated as expected.

        * Post order should be jrjed7, jrqhj4, jri2y8, jysgvx, jyu5b2, jyu73g,
          jyvuiz, jo1qwh.
        * jrjed7 should have "(2 duplicates — show)" at end of tagline.
        * jrqhj4 and jri2y8 should be hidden.
        * jyu5b2 should have "(2 duplicates — show)" at end of tagline.
        * jyu73g and jyvuiz should be hidden.

    3. Verify that both show/hide links work as expected.

## Settings

These tests verify the settings UI and the different settings values.

1. Deduplicate by

    1. Navigate to https://old.reddit.com/by_id/t3_jrjed7,t3_jrqhj4

    2. Verify that the two posts are collated.

    3. In the extension settings, select "URL only" deduplication mode.

    4. Refresh the page from step 1.

    5. Verify that the two posts are not collated.

2. Hash function

    1. Navigate to https://old.reddit.com/by_id/t3_jz43h4,t3_jz3x31.

    2. Verify that the two posts are collated.

    3. In the extension settings, select the "Difference Hash" function.

    4. Refresh the page from step 1.

    5. Verify that the two posts are still collated.

3. Hamming distance

    1. Navigate to https://old.reddit.com/by_id/t3_it6czg,t3_it6el1,t3_it8ric.

    2. Verify that all three posts are collated.

    3. In the extension settings, set the Hamming Distance to 0 (exact match).

    4. Refresh the page from step 1.

    5. Verify that only it6czg and it6el1 are collated.

4. Partition by domain

    1. Navigate to https://old.reddit.com/by_id/t3_jyymza,t3_jyyy2a.

    2. Verify that the two posts are not collated.

    3. In the extension settings, disable "Partition by domain".

    4. Refresh the page from step 1.

    5. Verify that the posts are collated.

5. Show hash values

    1. In the extension settings, enable "Show hash values".

    2. On https://old.reddit.com/, verify that posts with a thumbnail have an
       image hash value in the tagline. The hash string should be 16 hex
       digits.
