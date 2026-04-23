(function(){"use strict";$(()=>{var P,_;const{DestinationPages:l,Title:T,Description:j,Quote:O,DefaultDestinationPage:u,DefaultRegionPage:c}=(_=(P=window==null?void 0:window.out)==null?void 0:P.destinationselection)==null?void 0:_.destinationselection;(l==null?void 0:l.length)===1&&$(".destination-selection-dropdown").hide();const d=[],g=[],p=$(".destination-selection-slider .card-slider-wrapper"),m=$(".destination-selection-tabs-list"),h="";l==null||l.forEach(e=>{e!=null&&e.DestinationPageName&&(d==null||d.push(e==null?void 0:e.DestinationPageName)),g==null||g.push({destinationName:e==null?void 0:e.DestinationPageName,destinationDescription:e==null?void 0:e.DestinationPageDescription,FeaturedImage:e==null?void 0:e.FeaturedImage})});const f=e=>{const{Image:t,Eyebrow:o,Title:i,Content:a,CTA:r,Url:n}=e;return`
      <div class="card swiper-slide card-image-overlay promo-card" role="Promo Card">
        <div class="card-body" style="background-image: url(${h}${t.Url});">
        <div class="card-slider-eyebrow">${o}</div>
        <div class="card-title">${i}</div>
        <div class="card-text">${a}</div>
        <div class="card-cta-info">
          <a href="${n}" class="button" id="book" data-tag-item="property_card_promotional_block_cta" >
            ${r}
            <span class="icon-arrow">
              <svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="m4.5,3.49174l4,4l-4,4" stroke="#fffff" stroke-width="2"></path>
              </svg>
            </span>
          </a>
        </div>
      </div>
    `},L=(e,t)=>{const o=t.replaceAll(" ","").replaceAll("&","").replaceAll(",","").replaceAll("(","").replaceAll(")","");return`<div class="card-simplified-slider">
        <div id="${o}Carousel" class="carousel slide" data-bs-ride="false">
          <div class="carousel-indicators">
            ${e&&e.length>1?e==null?void 0:e.map((i,a)=>`<button type="button" title="photo${a}" name="photo${a}" data-bs-target="#${o}Carousel" data-bs-slide-to="${a}" class="${a==0?"active":""}" ></button>`).join(""):""}
          </div>
          ${e==null?void 0:e.map((i,a)=>`
                      <div class="carousel-item ${a==0?"active":""}">
                        ${i!=null&&i.includes(".mp4")?`
                          <video width="100%" height="100%" controls autoPlay muted playsInline>
                            <source src="${h}${i}" type="video/mp4" />
                          </video>`:`<img class="d-block w-100" src="${h}${i}" alt="${t}" data-bs-slide-to="${a}"   gallery_title="${t}"
                            image_position="${a+1}" />`}
                      </div>
                    `).join("")}
        </div>
        ${e&&e.length>1?`<a
          class="carousel-control-prev"
          title="previous"
          name="previous"
          href="#${o}Carousel"
          role="button"
          data-bs-slide="prev"
          data-tag-item="gallery_grid_pagination"
        >
          <span class="carousel-control-prev-icon" aria-hidden="true"></span>
        </a>
        <a
          class="carousel-control-next"
          href="#${o}Carousel"
          title="next"
          name="next"
          role="button"
          data-bs-slide="next"
          data-tag-item="gallery_grid_pagination"
          
          
        >
          <span class="carousel-control-next-icon" aria-hidden="true"></span>
        </a>`:""}
      </div>`},y=e=>{var k,C,S,D,I;const{BookingWidgets:t,Images:o,PropertyDescription:i,PropertyHighlights:a,PropertyName:r,Url:n,Prices:A,PricingInfo:s,PropertyCity:F,PropertyState:U,PropertySabreID:R,OverrideMagicLinkUrl:b}=e;return`
      <div class="card swiper-slide" property_id="${R}" property_name="${r}" >
        ${L(o,r)}
        <div class="card-body"  >
        ${r?`<h4>
            <a href="${n||"/"}" class="card-title" data-tag-item="property_card_title_link">
              <span>${r}</span>
            </a>
          </h4>`:""}
          
          <div class="card-text">${i||""}</div>
          ${a.Amenities.length>0?`<h6 class="card-highlights-title">${a.Title}</h6>
          <ul class="card-highlights">
          ${(k=a==null?void 0:a.Amenities)==null?void 0:k.map(q=>`<li>${q}</li>`)}
          </ul>`:""}
          <div class="card-price-block ${s!=null&&s.HotelId?"display-none-block":""}">
            <div class="card-price">
            ${A}
            <span class="card-price-time">
            ${s?s.IsFallback?"":(C=window.out.destinationselection.destinationselection.Labels)!=null&&C.PriceSuffix?(S=window.out.destinationselection.destinationselection.Labels)==null?void 0:S.PriceSuffix:"":""}</span>
            </div>
            <div class="card-price-details">
            ${s?s.IsFallback?"":(D=window.out.destinationselection.destinationselection.Labels)!=null&&D.PriceSubText?(I=window.out.destinationselection.destinationselection.Labels)==null?void 0:I.PriceSubText:"":""}
            </div>
          </div>
          <div class="card-cta-info" data-tag-item="property_card_book_now_cta">${b&&b.length>1?b:t}
          <a href="${n||"/"}" class="card-view-property">
              Learn More
          </a>
          </div>
        </div>
      </div>
    `},E=()=>d.map(e=>` <li class="dropdown-list">
                  <button class="dropdown-item" data-tag-item="home_destination_selector_dropdown_link">
                    ${e}
                  </button>
              </li>
            `);$(".destination-selection-dropdown ul").html(E()),$(document).on("click",".destination-selection-dropdown .dropdown-item, .destination-selection-destination",e=>{const t=$(e.currentTarget);let o="";const i=t.hasClass("destination-selection-destination")?t.find(".destination-selection-destination-content-title").text():t.text().trim();t[0].nodeName!=="A"?o=t.text().trim():o=t.find(".destination-selection-destination-content-title").text().trim(),$(".destination-selection-dropdown .dropdown-toggle").text(o),l.forEach(a=>{a.DestinationPageName===o&&w(a,0)}),$(".destination-selection").append(`
          <script>
            dataLayer.push({
                'event': 'homepage_destination_selector',
                'odpDestination': '${i}',
            });
          <\/script>
        `)}),$(document).on("click",".destination-selection-tabs-list button",function(){const e=$(this),t=Number(e.data("region-index")),o=e.data("destination"),i=e.text().trim();w(l[d.indexOf(o)],t),$(".destination-selection").append(`
    <script>
        dataLayer.push({
            'event': 'homepage_destination_selector',
            'odpDestination': '${i}',
        });
    <\/script>
`)}),$(document).on("click",".destination-selection-tabs-lists button",function(){const e=$(this),t=Number(e.data("region-index"));$(".destination-selection-tabs-list button").removeClass("is-active"),$(".destination-selection-tabs-list button[data-region-index='"+t+"']").addClass("is-active")});const N=()=>{document.querySelectorAll(".destination-selection-slider .card-slider-swiper").forEach(t=>{new Swiper(t,{slidesPerView:"auto",watchOverflow:!0,spaceBetween:0,watchSlidesProgress:!0,navigation:{nextEl:".swiper-button-next",prevEl:".swiper-button-prev"},on:{init:o=>{t.querySelector(".swiper-pagination-total")&&(t.querySelector(".swiper-pagination-total").textContent=t.querySelectorAll(".swiper-slide:not(.swiper-slide-duplicate)").length),t.querySelector(".swiper-pagination-current")&&(t.querySelector(".swiper-pagination-current").textContent=o.realIndex+(t.querySelectorAll(".swiper-slide:not(.swiper-slide-duplicate)").length?1:0)),$(t).prop("scrollWidth")+$(t).offset().left>window.innerWidth?$(t).find(".swiper-bottom").show():(t.swiper.destroy(),$(t).find(".swiper-bottom").hide())},slideChange:o=>{t.querySelector(".swiper-pagination-current").textContent=o.realIndex+1}},breakpoints:{750:{scrollbar:{el:t.querySelector(".swiper-scrollbar"),hide:!1,draggable:!0},navigation:{nextEl:t.querySelector(".swiper-button-next"),prevEl:t.querySelector(".swiper-button-prev")}}}})})},w=(e,t)=>{var o,i;m.html(""),$(".destination-selection-selected").text(e==null?void 0:e.DestinationPageName),e.PropertyLandingPages===null&&e.RegionPages!==null?(m.html(e==null?void 0:e.RegionPages.map((a,r)=>`<div class="destination-selection-tabs-lists"><button type="button" role="region tab" data-destination="${e==null?void 0:e.DestinationPageName}" data-region-index="${r}" class="${(a==null?void 0:a.RegionPageName.toLowerCase())==(c==null?void 0:c.toLowerCase())?"is-active":""}" data-tag-item="home_region_selector_tab_link">${a==null?void 0:a.RegionPageName}</button><div>`)),p.html((o=e==null?void 0:e.RegionPages[t].PropertyLandingPages)==null?void 0:o.map(y).join("")),e!=null&&e.RegionPages[t].PromoCard&&p.prepend(f(e==null?void 0:e.RegionPages[t].PromoCard))):(p.html((i=e==null?void 0:e.PropertyLandingPages)==null?void 0:i.map(y).join("")),e.PromoCard&&p.prepend(f(e.PromoCard))),N()};let v=0;u&&l&&l.length>0&&$(l).each(function(e,t){if(t.DestinationPageName===u)return v=e,$(".destination-selection-dropdown .dropdown-toggle").text(l[v].DestinationPageName),!1});let x=0;u&&l&&l.length>0&&$(l).each(function(e,t){$(t==null?void 0:t.RegionPages).each(function(o,i){if(i.RegionPageName.toLowerCase()===(c==null?void 0:c.toLowerCase()))return x=o,!1})}),w(l[v],x)})})();
