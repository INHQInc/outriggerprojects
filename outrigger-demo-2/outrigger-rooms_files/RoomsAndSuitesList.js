(function(){"use strict";$(()=>{var ie,ce;$(document).ready(function(){var s;const e=window.location.search;console.log("Current query string:",e);const o=$("#back-btn");if(console.log("Back button found:",o.length),e&&o.length){const t=(s=o.attr("href"))==null?void 0:s.split("?")[0];console.log("Base href:",t),o.attr("href",`${t}${e}`),console.log("Updated href:",o.attr("href"))}}),$("body").on("click",".card-title",function(){var l;const e=$(this).closest(".card").data("room-id"),o=((l=window.out)==null?void 0:l.resortCode)||"default";if(!e)return;const s=new Date,i=28*24*60*60*1e3;let c=JSON.parse(localStorage.getItem("viewed_rooms")||"{}");(!c.timestamp||new Date(c.timestamp).getTime()+i<s.getTime())&&(c={timestamp:s.toLocaleString(),data:{}}),c.data[o]||(c.data[o]=[]),c.data[o].includes(e)||(c.data[o].push(e),localStorage.setItem("viewed_rooms",JSON.stringify(c)))});const C=window.out.roomsAndSuites,E=(ce=(ie=C==null?void 0:C.labels)==null?void 0:ie.groupingBy)==null?void 0:ce.toLowerCase(),n=C.data,W=$(".roomslist-groups"),ae=$("body"),Y="",re="/";let G=0;function g(e){const s=new URLSearchParams(window.location.search).get(e);return s?s.split(","):[]}let w=!1,R="";if(window.location.search){let h=function(d,v){d.length>0&&d[0]!==""&&d.forEach(k=>{console.log(`Looking for checkbox with value: ${k}`);const S=k.trim().toLowerCase().replace(/\s+/g,"");setTimeout(()=>{$(`${v} input[type='checkbox']`).each(function(){const x=$(this).val().trim().toLowerCase().replace(/\s+/g,"");x===S&&(console.log(`Found and checked: ${x}`),$(this).prop("checked",!0),w=!0)})},100)})},b=function(d,v){d&&(d.includes("1")||d.includes("true"))&&(console.log("Applying mobile filter for unitchoice: 1 or true"),setTimeout(()=>{$(`${v}`).each(function(){console.log(`Found checkbox with ID: ${$(this).attr("id")}`),$(this).prop("checked",!0),w=!0})},100))};const e=g("view"),o=g("generic"),s=g("bedrooms"),t=g("suites"),i=g("accessible"),c=g("v47"),l=g("suites")[0],r=g("accessible")[0],u=g("v47")[0];window.innerWidth<=768&&(b(t,"#msuitesCheckbox"),b(i,"#maccessibleRoomsCheckbox"),b(c,"#mv47ClubRoomsCheckbox"),h(e,"#mroomViewCheckboxes"),h(s,"#mbedroomsCountCheckboxes"),h(o,"#mgenericCheckboxes")),window.innerWidth>=992&&(h(e,"#roomViewCheckboxes"),h(o,"#genericCheckboxes"),h(s,"#bedroomsCountCheckboxes"),(l==="1"||(l==null?void 0:l.toLowerCase())==="true")&&($("#suitesCheckbox").prop("checked",!0),w=!0),(u==="1"||(u==null?void 0:u.toLowerCase())==="true")&&($("#v47ClubRoomsCheckbox").prop("checked",!0),w=!0),(r==="1"||(r==null?void 0:r.toLowerCase())==="true")&&($("#accessibleRoomsCheckbox").prop("checked",!0),w=!0)),setTimeout(()=>{w&&(console.log("Delayed filter apply from URL..."),m())},300)}function ne(){const e=[];function o(l){const r=[];return l.forEach(u=>{$(`${u} input:checked`).each(function(){const h=$(this).val().trim().toLowerCase().replace(/\s+/g,"");r.push(h)})}),r}const s=o(["#roomViewCheckboxes","#mroomViewCheckboxes"]),t=o(["#genericCheckboxes","#mgenericCheckboxes"]),i=o(["#bedroomsCountCheckboxes","#mbedroomsCountCheckboxes"]);s.length&&e.push(`view=${s.join(",")}`),t.length&&e.push(`generic=${t.join(",")}`),i.length&&e.push(`bedrooms=${i.join(",")}`),($("#suitesCheckbox").is(":checked")||$("#msuitesCheckbox").is(":checked"))&&e.push("suites=1"),($("#v47ClubRoomsCheckbox").is(":checked")||$("#mv47ClubRoomsCheckbox").is(":checked"))&&e.push("v47=1"),($("#accessibleRoomsCheckbox").is(":checked")||$("#maccessibleRoomsCheckbox").is(":checked"))&&e.push("accessible=1"),R=e.join("&");const c=`${window.location.pathname}${R?"?"+R:""}`;history.replaceState({},"",c)}function de(){!R||$(".card-title").each(function(){var o;const e=(o=$(this).attr("href"))==null?void 0:o.split("?")[0];e&&$(this).attr("href",`${e}?${R}`)})}(()=>n.every(e=>e.roomView===null))()&&($("#ViewButtonContainer").hide(),$("#viewsfilter").hide(),$("#mroomViewCheckboxes").hide()),(()=>n.every(e=>e.genericeFilter===null))()&&($("#GenericButtonContainer").hide(),$("#genericfilter").hide(),$("#mgenericCheckboxes").hide()),(()=>n.every(e=>e.genericeFilterLabel===null))()&&($("#GenericButtonContainer").hide(),$("#genericfilter").hide(),$("#mgenericCheckboxes").hide()),(()=>n.every(e=>e.beddingOptions===null))()&&($("#BedroomButtonContainer").hide(),$("#bedroomfilter").hide(),$("#mbedroomsCountCheckboxes").hide());const K=()=>n.every(e=>e.v47ClubRoomFlag===!1);K()&&($("#v47rooms").hide(),$("#accessiblerooms").css("padding-left","43px"),$("#mv47rooms").hide());const Q=()=>n.every(e=>e.accessibleRoomFlag===!1);Q()&&($("#accessiblerooms").hide(),$("#maccessiblerooms").hide());const I=()=>n.every(e=>e.suites===!1);I()&&($("#suites").hide(),$("#mSuitesrooms").hide()),K()&&Q()&&I()&&$("#typefilter").hide(),ae.on("click",function(e){!$(e.target).closest(".dropdown").length&&!$(e.target).hasClass("desktop-filter")&&$(".dropdown-menu").removeClass("show")}),$(function(){$('[data-toggle="tooltip"]').tooltip()});const ue=(e,o)=>e.reduce((s,t)=>{var i,c;return(s[(i=t[o])==null?void 0:i.value]=s[(c=t[o])==null?void 0:c.value]||[]).push(t),s},{}),he=(e,o)=>e.sort((s,t)=>s[o]&&t[o]?s[o].sortOrder-t[o].sortOrder:-1);n.sort((e,o)=>e.sortIndex-o.sortIndex);function pe(e){if(E==="bedroom"){const o={};return e.forEach(s=>{(s.beddingOptions||[]).forEach(t=>{o[t.key]||(o[t.key]=[]),o[t.key].push(s)})}),o}else return ue(he(e,"roomView"),"roomView")}$("#ViewButton").click(function(){$(".dropdown-menu").removeClass("show"),$("#view-menu").toggleClass("show")}),$("#GenericButton").click(function(){$(".dropdown-menu").removeClass("show"),$("#generic-menu").toggleClass("show")}),$("#BedroomButton").click(function(){$(".dropdown-menu").removeClass("show"),$("#bedroom-list").toggleClass("show")}),$(".mobile-filter-button").click(function(){$(".filters-options").toggleClass("show")});const y=(e,o)=>{const s=$("#"+o),t=$("<ul>").addClass("checkbox-list");e.forEach(i=>{const c=$("<li>"),l=$("<input>").attr({type:"checkbox",name:o,value:i,id:i}),r=$("<label>").attr("for",i).text(i);c.append(l).append(r),t.append(c)}),s.append(t)},U=e=>{$("#totalRoomsPlaceholder").text(e),$("#mtotalRoomsPlaceholder").text(e)};U(n.length);const P=()=>{const e=new Set;$(".dropdown-menu input[type=checkbox]:checked").each(function(){e.add($(this).val())});const o=$(".checked-count");e.size>0?(o.text(e.size),o.show()):o.hide()};$(".dropdown-menu input[type=checkbox]").change(function(){P()});const me=n.flatMap(e=>e.beddingOptions||[]),J=[...new Map(me.map(e=>[e.key,e])).values()];J.sort((e,o)=>e.sortOrder-o.sortOrder);const X=J.map(e=>e.key);y(X,"bedroomsCountCheckboxes"),y(X,"mbedroomsCountCheckboxes");const Z=[...new Set(n.map(e=>{var o;return(o=e==null?void 0:e.roomView)==null?void 0:o.key}))].filter(e=>e!=null);y(Z,"roomViewCheckboxes"),y(Z,"mroomViewCheckboxes");const ee=[...new Set(n.map(e=>{var o;return(o=e==null?void 0:e.genericeFilter)==null?void 0:o.key}))].filter(e=>e!=null);y(ee,"genericCheckboxes"),y(ee,"mgenericCheckboxes");const ge=e=>{const o=$(`#${e}`);o.empty();const s=$(".dropdown-menu input[type=checkbox]:checked");if(s.length===0){U(n.length);return}s.each(function(){const t=$(this).val();if(!o.find(".filter-button").filter(function(){return $(this).text().trim()===t}).length){const c=$("<button>").addClass("filter-button position-relative").text(t),l=$(`
          <svg class="position-absolute" width="10" height="10" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="1.70711" y1="1.29289" x2="15.5641" y2="15.1498" stroke="white" stroke-width="2"/>
            <line x1="1.69524" y1="15.2929" x2="15.5522" y2="1.43594" stroke="white" stroke-width="2"/>
          </svg>
        `);c.append(l),l.click(function(){$(this).parent().remove(),$(`input[type=checkbox][value='${t}']`).prop("checked",!1),m(),P()}),o.append(c)}}),P()},m=()=>{const e={RoomView:[],GenericCount:[],BedroomsCount:[],SpecialFeatures:[],Suites:[],V47ClubRooms:[],AccessibleRooms:[]};if($("#roomViewCheckboxes input:checked").each(function(){e.RoomView.push($(this).val())}),$("#mroomViewCheckboxes input:checked").each(function(){e.RoomView.push($(this).val())}),$("#genericCheckboxes input:checked").each(function(){e.GenericCount.push($(this).val())}),$("#mgenericCheckboxes input:checked").each(function(){e.GenericCount.push($(this).val())}),$("#bedroomsCountCheckboxes input:checked").each(function(){e.BedroomsCount.push($(this).val())}),$("#mbedroomsCountCheckboxes input:checked").each(function(){e.BedroomsCount.push($(this).val())}),$("#specialFeaturesCheckboxes input:checked").each(function(){e.SpecialFeatures.push($(this).val())}),$("#suitesCheckbox").is(":checked")&&e.Suites.push("Suites"),$("#msuitesCheckbox").is(":checked")&&e.Suites.push("Suites"),$("#v47ClubRoomsCheckbox").is(":checked")&&e.V47ClubRooms.push("V47 Club Rooms"),$("#mv47ClubRoomsCheckbox").is(":checked")&&e.V47ClubRooms.push("V47 Club Rooms"),$("#accessibleRoomsCheckbox").is(":checked")&&e.AccessibleRooms.push("Accessible Rooms"),$("#maccessibleRoomsCheckbox").is(":checked")&&e.AccessibleRooms.push("Accessible Rooms"),ge("filterButtonsContainer"),e.RoomView.length===0&&e.GenericCount.length===0&&e.BedroomsCount.length===0&&e.SpecialFeatures.length===0&&e.Suites.length===0&&e.V47ClubRooms.length===0&&e.AccessibleRooms.length===0)se();else{const s=n.filter(t=>{var i,c,l,r;return(e.RoomView.length===0||e.RoomView.includes((i=t.roomView)==null?void 0:i.key))&&(e.GenericCount.length===0||e.GenericCount.includes((c=t.genericeFilter)==null?void 0:c.key))&&(e.BedroomsCount.length===0||((l=t.beddingOptions)==null?void 0:l.some(u=>e.BedroomsCount.includes(u.key))))&&(e.SpecialFeatures.length===0||((r=t.specialFeatures)==null?void 0:r.some(u=>e.SpecialFeatures.includes(u))))&&(e.Suites.length===0||t.suites)&&(e.V47ClubRooms.length===0||t.v47ClubRoomFlag)&&(e.AccessibleRooms.length===0||t.accessibleRoomFlag)});$e(s),U(s.length)}ne(),de()},$e=e=>{const o=oe(e);$(".roomslist-groups").html(o)};$(".apply").click(function(){m(),P(),$(".dropdown-menu").removeClass("show")}),$("#v47ClubRoomsCheckbox").click(function(){m()}),$("#accessibleRoomsCheckbox").click(function(){m()}),$("#suitesCheckbox").click(function(){m()}),$(".view-clear").click(function(){$("#roomViewCheckboxes input").prop("checked",!1),$(".roomslist-groups .card").addClass("loaded"),m(),$(".dropdown-menu").removeClass("show")}),$(".generic-clear").click(function(){$("#genericCheckboxes input").prop("checked",!1),$(".roomslist-groups .card").addClass("loaded"),m(),$(".dropdown-menu").removeClass("show")}),$(".bedrooms-clear").click(function(){$("#bedroomsCountCheckboxes input").prop("checked",!1),$(".roomslist-groups .card").addClass("loaded"),m(),$(".dropdown-menu").removeClass("show")}),$(".mobile-clear").click(function(){$(".roomslist-groups .card").addClass("loaded"),$("#mroomViewCheckboxes input").prop("checked",!1),$("#mgenericCheckboxes input").prop("checked",!1),$("#mbedroomsCountCheckboxes input").prop("checked",!1),$("#mcheckboxes input").prop("checked",!1),m(),$(".checked-count").hide(),$(".dropdown-menu").removeClass("show")}),$(".close-btn").click(function(){$(".dropdown-menu").removeClass("show")});let a={RoomView:[],SpecialFeatures:[]};localStorage.removeItem("roomlistFilter"),localStorage.getItem("roomlistFilter");const be=({roomGallery:e,roomTitle:o,roomDescription:s,prices:t,pricingInfo:i,banner:c,magicLink:l,roomPageUrl:r,isPromoCard:u,cTAText:h,cTALink:b,roomCode:d,pMSCode:v,contentID:k},S)=>{var V,B,F,A,_,O,p,f,L,j,M,T,z,N,le;const x=((V=window.out)==null?void 0:V.resortCode)||"default",D=((F=(B=JSON.parse(localStorage.getItem("viewed_rooms")||"{}").data)==null?void 0:B[x])==null?void 0:F.includes(d))?" viewed-room":"";return setTimeout(()=>{$(".roomslist-groups .card").eq(G).addClass("loaded"),G++},100*G+1),`${u===!1?`
        <div class="card loaded" data-room-id="${d}" room_type_name="${o}", room_type_code="${d}", room_pms_code="${d}"
        >
            ${c?`<div class="card-slider-tag-label ${c==null?void 0:c.cssClass}">${c==null?void 0:c.bannerText}</div>`:""}  
      ${e?Ce(e,o,k):""}
      <div class="card-body">
        <a class="card-title" href="${r}${window.location.search?"?"+window.location.search.substring(1):""}" data-tag-item="gallery_grid_select" ><span>${o||""}</span></a>
        <div class="card-text">${s||""}</div>
        <div class="card-price-block ${i!=null&&i.HotelId?"display-none-block":""}">
          <div class="card-price">
            ${t}
            <span class="card-price-time">${i?i.isFallback?"":(O=(_=(A=window==null?void 0:window.out)==null?void 0:A.roomsAndSuites)==null?void 0:_.labels)!=null&&O.priceSuffix?(L=(f=(p=window==null?void 0:window.out)==null?void 0:p.roomsAndSuites)==null?void 0:f.labels)==null?void 0:L.priceSuffix:"":""}</span>
          </div>
          <div class="card-price-details">
            ${i?i.isFallback?"":(T=(M=(j=window==null?void 0:window.out)==null?void 0:j.roomsAndSuites)==null?void 0:M.labels)!=null&&T.priceSubText?(le=(N=(z=window==null?void 0:window.out)==null?void 0:z.roomsAndSuites)==null?void 0:N.labels)==null?void 0:le.priceSubText:"":""}
          </div>
        </div>
        <div class="card-cta-info">
          ${l||""}
          </div>
           <div class="view-tag${D}">
              <span class="viewed-btn">Recently Viewed</span>
            </div>
        </div>
         </div>
        `:`
        <div class="card card-image-overlay promo-card loaded">
          <div class="card-body" style="background-image: url(&quot;/dist/images/related-img.png&quot;);">
            <div class="card-slider-eyebrow">MAUI</div>
            <div class="card-title">${o||""}</div>
            <div class="card-text">${s}</div>
            <div class="card-cta-info">
              ${h?`<a href="${b||"/"}" class="button">${h}<span class="icon-arrow"><svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m4.5,3.49174l4,4l-4,4" stroke="#fffff" stroke-width="2"></path></svg></span></a>`:""}
            </div>
          </div>
        </div>
        `}`},fe=(e,o,s)=>e.includes(".mp4")?`<video
                      width="100%"
                      height="100%"
                      controls
                      autoPlay
                      muted
                      playsInline
                      gallery_title="${s}"
                      image_position="${o+1}"
                    >
                      <source src="${Y}${e}" type="video/mp4" />
                    </video>`:e.includes("my.matterport.com")||e.includes("geckodigital.co")||e.includes("truetour.app")?`<iframe
        width="853"
        height="480"
        src="${e}"
        frameborder="0"
        allowfullscreen
        class="matterport"
      ></iframe>`:`<img
                  class="d-block w-100"
                  src="${Y}${e}"
                  alt="First slide"
                  data-bs-slide-to="${o}"
                  gallery_title="${s}"
                  image_position="${o+1}"
                />`,Ce=(e,o,s)=>`
    <div class="card-simplified-slider">
                <div id="roomlistCardCarousel${s}" class="carousel slide" data-bs-ride="false">
                ${e==null?void 0:e.map((t,i)=>`
                  <div class="carousel-item ${i==0?"active":""}">
                  ${fe(t,i,o)}
                    
                  </div>
                `).join("")}
              
              <div class="carousel-indicators">
                ${e.length>1?e==null?void 0:e.map((t,i)=>`
                <button
                    type="button"
                    title="photo${i}"
                    name="photo${i}"
                    data-bs-target="#roomlistCardCarousel${s}"
                    data-bs-slide-to="${i}"
                    class="${i==0?"active":""}"
                  ></button>
                `).join(""):""} 
     </div>
       <!--------icon gallery paste here -------->
     <button class="enableGallery" id="enableGallery${s}" data-contentid="${s}" data-bs-toggle="modal" data-bs-target="#exampleModalToggle" aria-label="Open gallery" title="Open gallery">
       <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M480 416v16c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V176c0-26.5 21.5-48 48-48h16v208c0 44.1 35.9 80 80 80h336zm96-80V80c0-26.5-21.5-48-48-48H144c-26.5 0-48 21.5-48 48v256c0 26.5 21.5 48 48 48h384c26.5 0 48-21.5 48-48zM256 128c0 26.5-21.5 48-48 48s-48-21.5-48-48 21.5-48 48-48 48 21.5 48 48zm-96 144l55.5-55.5c4.7-4.7 12.3-4.7 17 0L272 256l135.5-135.5c4.7-4.7 12.3-4.7 17 0L512 208v112H160v-48z" data-index="0" style="opacity: 1; visibility: visible; fill: rgb(255, 255, 255);"></path></svg>
    </button>  
              </div >
  ${e.length>1?`
              <a
                class="carousel-control-prev"
                title="previous"
                name="previous"
                href="#roomlistCardCarousel${s}"
                role="button"
                data-bs-slide="prev"
                data-tag-item="gallery_grid_pagination"
              >
                <span
                  class="carousel-control-prev-icon"
                  aria-hidden="true"
                ></span>
              </a>
              <a
                class="carousel-control-next"
                href="#roomlistCardCarousel${s}"
                title="next"
                name="next"
                role="button"
                data-bs-slide="next"
                data-tag-item="gallery_grid_pagination"
              >
                <span
                  class="carousel-control-next-icon"
                  aria-hidden="true"
                ></span>
              </a>`:""}
              </div>`,oe=e=>e.map(be).join("");function we(e){return e.replace(/[^a-zA-Z0-9 ]/g,"").trim().split(" ").map((s,t)=>s.charAt(0).toUpperCase()+s.slice(1).toLowerCase()).join("")}const ve=({roomView:e})=>`
  <div class="card loaded card-image-overlay promo-card swiper-slide">
    <div class="card-body" style='background-image:url("${e.promoCardImage||""}")'>
        <div class="card-slider-eyebrow">${e.promoCardEyebrow||""}</div>
        <div class="card-title">${e.promoCardTitle||""}</div>
        <div class="card-text">
            ${e.promoCardDescription||""}
        </div>
        ${e.promoCardCTAText&&e.promoCardCTALink?`
        <div class="card-cta-info">
            <a href="${e.promoCardCTALink}" class="button" id="book" ${e.openInNewWindow?'target="_blank"':""}>
                ${e.promoCardCTAText}
                <span class="icon-arrow">
                    <svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="m4.5,3.49174l4,4l-4,4" stroke="#ffffff" stroke-width="2"></path>
                    </svg>
                </span>
            </a>
        </div>`:""}
    </div>
  </div>`,se=()=>{const e=pe(n),o=Object.entries(e).map(([s,t])=>{var h,b,d,v,k,S,x,H,q,D,V,B,F,A,_,O;const i=we(s),c=t.filter(p=>{var f,L,j,M,T;return(((f=a==null?void 0:a.RoomView)==null?void 0:f.length)==0||((j=a==null?void 0:a.RoomView)==null?void 0:j.includes((L=p==null?void 0:p.roomView)==null?void 0:L.key)))&&(((M=a==null?void 0:a.SpecialFeatures)==null?void 0:M.length)==0||((T=p.specialFeatures)==null?void 0:T.some(z=>{var N;return(N=a==null?void 0:a.SpecialFeatures)==null?void 0:N.includes(z)})))}),l=((b=(h=a.RoomView)==null?void 0:h.length)!=null?b:0)===0&&((v=(d=a.GenericCount)==null?void 0:d.length)!=null?v:0)===0&&((S=(k=a.BedroomsCount)==null?void 0:k.length)!=null?S:0)===0&&((H=(x=a.SpecialFeatures)==null?void 0:x.length)!=null?H:0)===0&&((D=(q=a.Suites)==null?void 0:q.length)!=null?D:0)===0&&((B=(V=a.V47ClubRooms)==null?void 0:V.length)!=null?B:0)===0&&((A=(F=a.AccessibleRooms)==null?void 0:F.length)!=null?A:0)===0,r=t.find(p=>{var f;return((f=p.roomView)==null?void 0:f.isPromoCard)===!0}),u=E!=="bedroom"&&l&&r?ve({roomView:r.roomView}):"";return c.length>0?`
        <div class="roomslist-title-row">
         <h3 class="card-slider-title" title="${i}" name="${i}">
         ${s}</h3>
          <div class="card-slider-subtitle">
            ${((O=(_=c.find(p=>p==null?void 0:p.roomView))==null?void 0:_.roomView)==null?void 0:O.description)||""}
          </div>
        </div>
        ${u}
        ${oe(c)}
      `:""});o.every(s=>s==="")?W.html(C==null?void 0:C.resultMessage):W.html(o.join(""))};se(),w&&(console.log("Applying filters based on URL parameters..."),m());const te=$("<div>",{class:"room-gallery-slider-wrapper"});$(document).on("click",".enableGallery",async function(){const e=$(this).data("contentid"),o=$("#exampleModalToggle .modal-content");o.find(".gallery-lightbox_inner").remove();const c=(await(await fetch(`${re}api/roomcontent/getgalleryimages?itemId=${e}`)).json()).map(l=>({MediaType:l.mediaType==="metterport"?"iframe":l.mediaType,URL:l.url,Description:l.description||""})).map((l,r)=>ke(r,l)).join("");o.append(c)});const ke=(e,{MediaType:o,URL:s,Description:t})=>{let i="";return o==="video"?i=`<video controls autoplay muted playsinline loading="lazy" preload="auto">
      <source src="${s}" type="video/mp4" />
    </video>`:o==="image"?i=`<img src="${s}" alt="${t}" loading="lazy" />`:i=`<iframe
        width="853"
        height="480"
        src="${s}"
        frameborder="0"
        loading="lazy"
        allowfullscreen
      ></iframe>`,`
    <div class="gallery-lightbox_inner" data-index="${e}">
      ${i}
    </div>`},xe=()=>`
    <div class="gallery-slider_gallery modal fade" tabindex="-1"
      role="dialog" aria-hidden="true"
      id="exampleModalToggle" data-bs-backdrop="static">

      <button type="button" class="room-gallery-slider-close" id="gallery-slider-close" data-bs-dismiss="modal" aria-label="Close gallery"
      title="Close gallery"></button>

      <div id="gallery-lightbox" class="gallery-lightbox modal-dialog modal-dialog-centered">
        <div class="modal-content">
         <!-- gallery will be injected here on button click -->
        </div>
      </div>
    </div>`;te.append(xe()),$("body").append(te)})})();
