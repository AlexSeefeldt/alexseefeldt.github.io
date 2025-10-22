{
  // API key is provided to the script via the `data-api-key` attribute on the <script> element
  const api_key = document.currentScript.dataset.apiKey;
  if (!api_key) {
    throw new Error('album-art: provide an API key to the <script> tag with the "data-api-key" attribute');
  }

  const API_URL = 'https://ws.audioscrobbler.com/2.0/';

  // utility function to make a key for use in localStorage, unique to a given album/artist query
  function make_key(artist, album) {
    return `${album}\n${artist}`;
  }

  // obtain the lastfm entry for the given album, either via fetch
  // or from cached entry in localStorage
  async function get_lastfm_entry(artist, album) {
    const local_storage_key = make_key(artist, album);
    let entry = null;
    try {
      // get the JSON from localStorage and parse it into an object
      const json = window.localStorage.getItem(local_storage_key);
      entry = JSON.parse(json);
    } catch {
      // pass (if parse fails, we just refetch)
    }
    if (entry) {
      // successfully pulled entry from localStorage
      return entry;
    } else {
      // query parameters for our request to last.fm API
      const search = new URLSearchParams({
        method: 'album.getinfo',
        format: 'json',
        api_key,
        artist,
        album,
      }).toString();
      // call last.fm API with these query parameters
      return fetch(`${API_URL}?${search}`)
      .then(response => response.json())
      .then(lastfm => {
        if (lastfm.error) {
          throw lastfm.error;
        } else {
          // pull the specific property we care about from the response object (listing of image URLs for the album)
          const entry = {
            name: lastfm.album.name,
            artist: lastfm.album.artist,
            image: lastfm.album.image,
          };
          console.info(entry)
          // cache it in localStorage for next time this album/artist pair gets called
          window.localStorage.setItem(local_storage_key, JSON.stringify(entry));
          return entry;
        }
      });
    }
  }

  // fetch album art according to artist/album query and put it into the given <img> element
  async function fetch_album_art(artist, album, img, is_retry) {
    try {
      // get the array of image URLs from last.fm or cache
      const entry = await get_lastfm_entry(artist, album);
      // choose a size appropriate to the <img> element
      // fallthrough case is 'mega'
      let target_size = 'mega';
      let img_size = Math.max(img.width, img.height);
      // we want the image to be slightly higher-resolution than the screen size,
      // to look OK on high-density displays,
      // so we set our thresholds at 0.75 times the respective image size
      if (img_size <= 25) { // 34 * 0.75
        target_size = 'small';
      } else if (img_size <= 48) { // 64 * 0.75
        target_size = 'medium';
      } else if (img_size <= 130) { // 174 * 0.75
        target_size = 'large';
      } else if (img_size <= 225) { // 300 * 0.75
        target_size = 'extralarge';
      } // otherwise 'mega'
      // find the corresponding image, or just use the last one if that fails
      const art = entry.image.find(({size}) => size === target_size) ?? entry.image[entry.image.length - 1];
      const url = art['#text'];
      if (url) {
        // set URL on <img> element
        img.src = url;
        img.title = `Album art for ${entry.name} by ${entry.artist}`;
        // if this image fails to load, the cached last.fm entry is consdered no longer valid
        img.addEventListener('error', () => {
          // get rid of the bad cache entry
          window.localStorage.removeItem(make_key(artist, album));
          // we'll retry fetching it one time
          if (!is_retry) {
            // call this function again, with the retry flag set so we don't recurse forever
            fetch_album_art(album, artist, img, true);
          } else {
            // if we've already retried, set the error on the <img> element
            img.dataset.error = 'Failed to load image source after retry';
          }
        });
      } else {
        throw new Error('Image unavailable');
      }
    } catch (error) {
      if (error.message === 'Image unavailable') {
        // this is our error message, so we want to keep it as-is
        throw error;
      }
      throw new Error('Image fetch failed: ' + error.message);
    }
  }

  // the actual entrypoint of the script
  // iterate through all <img> elements with the needed data attributes defined
  for (const img of document.querySelectorAll('img[data-album][data-artist]')) {
    // run the function to populate this <img> element
    // upon error, put the error message in the "data-error" attribute on the <img> element
    fetch_album_art(img.dataset.artist, img.dataset.album, img)
    .catch(e => img.dataset.error = e.message);
  }
}

