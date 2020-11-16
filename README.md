# Reddit Deduplicator

A web extension to hide duplicate posts on "Old" Reddit.

When viewing a list of posts, the extension finds posts with the same URL or
thumbnail and groups them together, showing only the first instance.

This is particularly useful when looking at a user's posts, as some users will
post the same link or upload the same image to multiple subreddits.

## Technical discussion

### Perceptual image hashing

To detect duplicate thumbnails, the extension uses a perceptual hash algorithm
to reduce each image to a 64-bit hash. Ideally, a perceptual hash algorithm
should be insensitive to minor changes in an image — visually similar images
should have similar hash values. This extension offers two alternative hash
functions:

* DCT Hash: Scale the image to 32x32 and compute the direct cosine transform of
  the pixel luminance values. Use the sign bits of the upper-left triangle of
  coefficients as the bits of the hash.

  This hash has good accuracy as much of the perceptual information in an image
  is contained in the low-frequency components of the DCT. However, it can be
  slow to compute. We use an optimized fast-DCT algorithm to compute the DCT
  with fewer arithmetic operations.

* Difference Hash: Scale the image to 8x8 grayscale and compare adjacent pixels
  along a space-filling loop. Use the results of the comparison as the bits of
  the hash.

  This hash is very fast to compute, but is sensitive to minor fluctuations in
  brightness across "flat" areas of the image where the difference in
  brightness is close to zero.

### Finding similar hashes

Although searching for exact matches yields surprisingly good results, in order
to further reduce false negatives we would like to group thumbnails whose hash
values differ by only a few bits. In order to find such almost-equal hashes, we
use a BK-tree, a simple data structure adapted to discrete metric spaces.
