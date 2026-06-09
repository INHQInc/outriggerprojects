(function(){"use strict";$(()=>{const l="",u=(a,r,s)=>a.includes(".mp4")?`<video width="100%" height="100%" controls autoplay muted playsInline gallery_title="${s}" image_position="${r+1}">
                <source src="${l}${a}" type="video/mp4" />
              </video>`:a.includes("my.matterport.com")||a.includes("geckodigital.co")||a.includes("truetour.app")?`<iframe width="853" height="480" src="${a}" frameborder="0" allowfullscreen class="matterport"></iframe>`:`<img class="d-block w-100" src="${l}${a}" alt="Slide ${r+1}" data-bs-slide-to="${r}" gallery_title="${s}" image_position="${r+1}" />`,n=(a,r,s)=>`
      <div class="card-simplified-slider">
        <div id="roomsuitesCardCarousel${s}" class="carousel slide" data-bs-ride="false">
          <div class="carousel-inner">
            ${a.map((o,e)=>`
              <div class="carousel-item ${e===0?"active":""}">
                ${u(o,e,r)}
              </div>
            `).join("")}
          </div>

          ${a.length>1?`
            <div class="carousel-indicators">
              ${a.map((o,e)=>`
                <button type="button" title="photo${e}" name="photo${e}" data-bs-target="#roomsuitesCardCarousel${s}" data-bs-slide-to="${e}" class="${e===0?"active":""}"></button>
              `).join("")}
            </div>
            <a class="carousel-control-prev" href="#roomsuitesCardCarousel${s}" role="button" data-bs-slide="prev">
              <span class="carousel-control-prev-icon" aria-hidden="true"></span>
            </a>
            <a class="carousel-control-next" href="#roomsuitesCardCarousel${s}" role="button" data-bs-slide="next">
              <span class="carousel-control-next-icon" aria-hidden="true"></span>
            </a>`:""}
        </div>
      </div>`;$(".room-and-suites-slider").each(function(){var o,e,i;const r=(o=$(this).attr("id"))==null?void 0:o.replace(/-/g,"_"),s=(i=(e=window.out)==null?void 0:e.roomGalleryData)==null?void 0:i[r];Array.isArray(s)?s.forEach(({roomGallery:c,roomTitle:p,contentID:t})=>{if(Array.isArray(c)&&t){const d=$(`#gallery-carousel-${t}`);if(d.length){const R=n(c,p,t);d.html(R)}else console.warn(`Target div #gallery-carousel-${t} not found`)}}):console.warn(`No room gallery data found for block ${r}`)})})})();
