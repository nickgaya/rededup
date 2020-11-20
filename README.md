# <img src="icons/icon.svg" width="48" /> Reddit Deduplicator

A web extension to hide duplicate posts on pre-redesign Reddit.

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

* **DCT Hash**: Scale the image to 32x32 and compute the direct cosine transform
  (DCT) of the pixel luminance values. Use the sign bits of the upper-left
  triangle of coefficients as the bits of the hash.

  This hash has good accuracy as much of the perceptual information in an image
  is contained in the low-frequency components of the DCT. We can even use the
  hash to reconstruct an image that preserves many large-scale features of the
  original (see below).

  However, the DCT can be slow to compute, as a naive implementation requires
  O(n<sup>3</sup>) multiplications for an n×n input matrix. We use an optimized
  fast-DCT algorithm to compute the DCT with fewer arithmetic operations.

    | <img src="images/gaugin1_original.png" width="105" height="128" /> | <img src="images/gaugin2_reconstructed.png" width="105" height="128" /> |
    | :---: | :---: |
    | *Original* | *Visualization <br /> of DCT hash* |

* **Difference Hash**: Scale the image to 8x8 grayscale and compare adjacent
  pixels along a space-filling loop. Use the results of the comparison as the
  bits of the hash.

  This hash is very fast to compute, but is sensitive to minor fluctuations in
  brightness across "flat" areas of the image where the difference in
  brightness is close to zero.

For visualizations of the different hash functions, see the
[perceptual hash demo](phdemo/).

### Finding similar hashes

Although searching for exact matches yields surprisingly good results, in order
to further reduce false negatives we would like to group thumbnails whose hash
values differ by only a few bits. In order to find such almost-equal hashes, we
use a BK-tree, a simple data structure adapted to discrete metric spaces.

## Screenshots

| <img src="images/s1_hide.png" width="640" /> |
| :---: |
| *The extension automatically detects and hides duplicate posts.* |

| <img src="images/s2_show.png" width="640" /> |
| :---: |
| *Click the "show"/"hide" link to reveal or hide duplicates.* |

## Credits

Merge icon by [Freepik](https://www.freepik.com/) from [www.flaticon.com](https://www.flaticon.com/) (modified from original).
