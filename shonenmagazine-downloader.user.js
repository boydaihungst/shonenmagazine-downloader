// ==UserScript==
// @name         Download Shonen Magazine manga as ZIP
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Intercept fetch, collect images, and download them all as a zip with proper filenames from pocket.shonenmagazine.com/episode/*
// @author       boydaihungst
// @match        https://pocket.shonenmagazine.com/title/*/episode/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.9.1/jszip.min.js
// @updateURL    https://raw.githubusercontent.com/boydaihungst/shonenmagazine-downloader/refs/heads/master/shonenmagazine-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/boydaihungst/shonenmagazine-downloader/refs/heads/master/shonenmagazine-downloader.user.js
// @grant        unsafeWindow
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// ==/UserScript==

(function () {
  "use strict";

  function gmFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || "GET",
        url,
        headers: options.headers || {},
        data: options.body || null,
        responseType: options.responseType || "text",
        onload: (res) => resolve(res),
        onerror: (err) => reject(err),
      });
    });
  }

  async function canvasToBlob(canvas, type = "image/jpeg", quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas toBlob() failed."));
          }
        },
        type,
        quality,
      );
    });
  }

  async function blobToImage(blob) {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      img.onload = () => {
        URL.revokeObjectURL(url); // Clean up
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }
  function* xorshift32(seed) {
    const s = new Uint32Array([seed >>> 0]);
    while (true) {
      s[0] ^= s[0] << 13;
      s[0] ^= s[0] >>> 17;
      s[0] ^= s[0] << 5;
      yield s[0] >>> 0;
    }
  }

  function shuffleOrder(count, seed) {
    const gen = xorshift32(seed);
    return [...Array(count).keys()]
      .map((i) => [gen.next().value, i])
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1]);
  }

  async function unscrambleImage(imgBlob, scrambleSeed, tileCount = 4) {
    const img = await blobToImage(imgBlob);
    const { width, height } = img;
    const ctx = Object.assign(document.createElement("canvas"), {
      width,
      height,
    }).getContext("2d");

    // tile dimensions
    const tileW = Math.floor(width / tileCount);
    const tileH = Math.floor(height / tileCount);

    const order = shuffleOrder(tileCount ** 2, scrambleSeed);

    for (let i = 0; i < order.length; i++) {
      const srcX = (order[i] % tileCount) * tileW;
      const srcY = Math.floor(order[i] / tileCount) * tileH;
      const destX = (i % tileCount) * tileW;
      const destY = Math.floor(i / tileCount) * tileH;
      ctx.drawImage(img, srcX, srcY, tileW, tileH, destX, destY, tileW, tileH);
    }

    return await canvasToBlob(ctx.canvas, "image/jpeg", 0.9);
  }

  const originalFetch = unsafeWindow.fetch;

  unsafeWindow.fetch = async (...args) => {
    const [url, _] = args;

    const response = await originalFetch(...args);
    if (
      typeof url === "string" &&
      url.match(
        /.*api.pocket.shonenmagazine.com\/web\/episode\/viewer\?platform=.*&episode_id=.*/,
      )
    ) {
      const clonedResponse = response.clone();
      let scrambleSeed;

      try {
        const contentType = clonedResponse.headers.get("content-type");
        let data;
        if (contentType && contentType.includes("application/json")) {
          data = await clonedResponse.json();
        } else {
          alert("Not JSON");
        }
        if (data.page_list) {
          scrambleSeed = data.scramble_seed;
          let matchedUrls = [];
          matchedUrls = data.page_list;

          const downloadButton = document.createElement("button");
          downloadButton.id = "custom-download-button";
          downloadButton.textContent = "Download All Images as ZIP";
          downloadButton.style.position = "fixed";
          downloadButton.style.bottom = "20px";
          downloadButton.style.right = "20px";
          downloadButton.style.zIndex = "9999";
          downloadButton.style.padding = "10px 15px";
          downloadButton.style.backgroundColor = "#007bff";
          downloadButton.style.color = "white";
          downloadButton.style.border = "none";
          downloadButton.style.borderRadius = "5px";
          downloadButton.style.cursor = "pointer";
          downloadButton.style.display = "block";
          document.body.appendChild(downloadButton);

          downloadButton.addEventListener("click", async () => {
            downloadButton.disabled = true;
            if (matchedUrls.length === 0) {
              alert("No images intercepted yet!");
              downloadButton.textContent = "Download All Images as ZIP";
              downloadButton.disabled = false;
              return;
            }

            const zip = new JSZip();

            let i = 0;
            for (const imgUrl of matchedUrls) {
              downloadButton.textContent = `Downloading (${i}/${matchedUrls.length})...`;
              try {
                const imgRawRes = await gmFetch(imgUrl, {
                  responseType: "blob",
                });
                const blob = await imgRawRes.response;
                const imgBlob = await unscrambleImage(blob, +scrambleSeed);

                const filename = `${i}.jpg`;

                zip
                  .folder(
                    `${document.getElementsByTagName("title")[0].innerText || "image"}`,
                  )
                  .file(filename, imgBlob);
              } catch (e) {
                console.error("Failed to fetch image:", imgUrl, e);
              }
              i++;
            }
            zip.generateAsync({ type: "blob" }).then((content) => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(content);
              a.download = "images.zip";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);

              downloadButton.disabled = false;
              downloadButton.textContent = "Download All Images as ZIP";
              URL.revokeObjectURL(a.href);
            });
          });
        }
      } catch (err) {
        console.error(`Error reading response from ${url}:`, err);
      }
    }
    return response;
  };
})();
