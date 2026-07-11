(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(i){if(i.ep)return;i.ep=!0;const r=t(i);fetch(i.href,r)}})();const vo=()=>{};var Ls={};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Pi={NODE_ADMIN:!1,SDK_VERSION:"${JSCORE_VERSION}"};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const f=function(n,e){if(!n)throw Ve(e)},Ve=function(n){return new Error("Firebase Database ("+Pi.SDK_VERSION+") INTERNAL ASSERT FAILED: "+n)};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Oi=function(n){const e=[];let t=0;for(let s=0;s<n.length;s++){let i=n.charCodeAt(s);i<128?e[t++]=i:i<2048?(e[t++]=i>>6|192,e[t++]=i&63|128):(i&64512)===55296&&s+1<n.length&&(n.charCodeAt(s+1)&64512)===56320?(i=65536+((i&1023)<<10)+(n.charCodeAt(++s)&1023),e[t++]=i>>18|240,e[t++]=i>>12&63|128,e[t++]=i>>6&63|128,e[t++]=i&63|128):(e[t++]=i>>12|224,e[t++]=i>>6&63|128,e[t++]=i&63|128)}return e},Co=function(n){const e=[];let t=0,s=0;for(;t<n.length;){const i=n[t++];if(i<128)e[s++]=String.fromCharCode(i);else if(i>191&&i<224){const r=n[t++];e[s++]=String.fromCharCode((i&31)<<6|r&63)}else if(i>239&&i<365){const r=n[t++],o=n[t++],a=n[t++],l=((i&7)<<18|(r&63)<<12|(o&63)<<6|a&63)-65536;e[s++]=String.fromCharCode(55296+(l>>10)),e[s++]=String.fromCharCode(56320+(l&1023))}else{const r=n[t++],o=n[t++];e[s++]=String.fromCharCode((i&15)<<12|(r&63)<<6|o&63)}}return e.join("")},Qn={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(n,e){if(!Array.isArray(n))throw Error("encodeByteArray takes an array as a parameter");this.init_();const t=e?this.byteToCharMapWebSafe_:this.byteToCharMap_,s=[];for(let i=0;i<n.length;i+=3){const r=n[i],o=i+1<n.length,a=o?n[i+1]:0,l=i+2<n.length,c=l?n[i+2]:0,d=r>>2,u=(r&3)<<4|a>>4;let h=(a&15)<<2|c>>6,p=c&63;l||(p=64,o||(h=64)),s.push(t[d],t[u],t[h],t[p])}return s.join("")},encodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?btoa(n):this.encodeByteArray(Oi(n),e)},decodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?atob(n):Co(this.decodeStringToByteArray(n,e))},decodeStringToByteArray(n,e){this.init_();const t=e?this.charToByteMapWebSafe_:this.charToByteMap_,s=[];for(let i=0;i<n.length;){const r=t[n.charAt(i++)],a=i<n.length?t[n.charAt(i)]:0;++i;const c=i<n.length?t[n.charAt(i)]:64;++i;const u=i<n.length?t[n.charAt(i)]:64;if(++i,r==null||a==null||c==null||u==null)throw new bo;const h=r<<2|a>>4;if(s.push(h),c!==64){const p=a<<4&240|c>>2;if(s.push(p),u!==64){const _=c<<6&192|u;s.push(_)}}}return s},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let n=0;n<this.ENCODED_VALS.length;n++)this.byteToCharMap_[n]=this.ENCODED_VALS.charAt(n),this.charToByteMap_[this.byteToCharMap_[n]]=n,this.byteToCharMapWebSafe_[n]=this.ENCODED_VALS_WEBSAFE.charAt(n),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[n]]=n,n>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(n)]=n,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(n)]=n)}}};class bo extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const xi=function(n){const e=Oi(n);return Qn.encodeByteArray(e,!0)},Dt=function(n){return xi(n).replace(/\./g,"")},Nn=function(n){try{return Qn.decodeString(n,!0)}catch(e){console.error("base64Decode failed: ",e)}return null};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Eo(n){return Mi(void 0,n)}function Mi(n,e){if(!(e instanceof Object))return e;switch(e.constructor){case Date:const t=e;return new Date(t.getTime());case Object:n===void 0&&(n={});break;case Array:n=[];break;default:return e}for(const t in e)!e.hasOwnProperty(t)||!wo(t)||(n[t]=Mi(n[t],e[t]));return n}function wo(n){return n!=="__proto__"}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Io(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const So=()=>Io().__FIREBASE_DEFAULTS__,To=()=>{if(typeof process>"u"||typeof Ls>"u")return;const n=Ls.__FIREBASE_DEFAULTS__;if(n)return JSON.parse(n)},Ro=()=>{if(typeof document>"u")return;let n;try{n=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const e=n&&Nn(n[1]);return e&&JSON.parse(e)},Li=()=>{try{return vo()||So()||To()||Ro()}catch(n){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${n}`);return}},No=n=>{var e,t;return(t=(e=Li())===null||e===void 0?void 0:e.emulatorHosts)===null||t===void 0?void 0:t[n]},ko=n=>{const e=No(n);if(!e)return;const t=e.lastIndexOf(":");if(t<=0||t+1===e.length)throw new Error(`Invalid host ${e} with no separate hostname and port!`);const s=parseInt(e.substring(t+1),10);return e[0]==="["?[e.substring(1,t-1),s]:[e.substring(0,t),s]},Fi=()=>{var n;return(n=Li())===null||n===void 0?void 0:n.config};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class G{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((e,t)=>{this.resolve=e,this.reject=t})}wrapCallback(e){return(t,s)=>{t?this.reject(t):this.resolve(s),typeof e=="function"&&(this.promise.catch(()=>{}),e.length===1?e(t):e(t,s))}}}/**
 * @license
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Xn(n){try{return(n.startsWith("http://")||n.startsWith("https://")?new URL(n).hostname:n).endsWith(".cloudworkstations.dev")}catch{return!1}}async function Ao(n){return(await fetch(n,{credentials:"include"})).ok}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Do(n,e){if(n.uid)throw new Error('The "uid" field is no longer supported by mockUserToken. Please use "sub" instead for Firebase Auth User ID.');const t={alg:"none",type:"JWT"},s=e||"demo-project",i=n.iat||0,r=n.sub||n.user_id;if(!r)throw new Error("mockUserToken must contain 'sub' or 'user_id' field!");const o=Object.assign({iss:`https://securetoken.google.com/${s}`,aud:s,iat:i,exp:i+3600,auth_time:i,sub:r,user_id:r,firebase:{sign_in_provider:"custom",identities:{}}},n);return[Dt(JSON.stringify(t)),Dt(JSON.stringify(o)),""].join(".")}const et={};function Po(){const n={prod:[],emulator:[]};for(const e of Object.keys(et))et[e]?n.emulator.push(e):n.prod.push(e);return n}function Oo(n){let e=document.getElementById(n),t=!1;return e||(e=document.createElement("div"),e.setAttribute("id",n),t=!0),{created:t,element:e}}let Fs=!1;function xo(n,e){if(typeof window>"u"||typeof document>"u"||!Xn(window.location.host)||et[n]===e||et[n]||Fs)return;et[n]=e;function t(h){return`__firebase__banner__${h}`}const s="__firebase__banner",r=Po().prod.length>0;function o(){const h=document.getElementById(s);h&&h.remove()}function a(h){h.style.display="flex",h.style.background="#7faaf0",h.style.position="fixed",h.style.bottom="5px",h.style.left="5px",h.style.padding=".5em",h.style.borderRadius="5px",h.style.alignItems="center"}function l(h,p){h.setAttribute("width","24"),h.setAttribute("id",p),h.setAttribute("height","24"),h.setAttribute("viewBox","0 0 24 24"),h.setAttribute("fill","none"),h.style.marginLeft="-6px"}function c(){const h=document.createElement("span");return h.style.cursor="pointer",h.style.marginLeft="16px",h.style.fontSize="24px",h.innerHTML=" &times;",h.onclick=()=>{Fs=!0,o()},h}function d(h,p){h.setAttribute("id",p),h.innerText="Learn more",h.href="https://firebase.google.com/docs/studio/preview-apps#preview-backend",h.setAttribute("target","__blank"),h.style.paddingLeft="5px",h.style.textDecoration="underline"}function u(){const h=Oo(s),p=t("text"),_=document.getElementById(p)||document.createElement("span"),E=t("learnmore"),O=document.getElementById(E)||document.createElement("a"),J=t("preprendIcon"),Z=document.getElementById(J)||document.createElementNS("http://www.w3.org/2000/svg","svg");if(h.created){const me=h.element;a(me),d(O,E);const pn=c();l(Z,J),me.append(Z,_,O,pn),document.body.appendChild(me)}r?(_.innerText="Preview backend disconnected.",Z.innerHTML=`<g clip-path="url(#clip0_6013_33858)">
<path d="M4.8 17.6L12 5.6L19.2 17.6H4.8ZM6.91667 16.4H17.0833L12 7.93333L6.91667 16.4ZM12 15.6C12.1667 15.6 12.3056 15.5444 12.4167 15.4333C12.5389 15.3111 12.6 15.1667 12.6 15C12.6 14.8333 12.5389 14.6944 12.4167 14.5833C12.3056 14.4611 12.1667 14.4 12 14.4C11.8333 14.4 11.6889 14.4611 11.5667 14.5833C11.4556 14.6944 11.4 14.8333 11.4 15C11.4 15.1667 11.4556 15.3111 11.5667 15.4333C11.6889 15.5444 11.8333 15.6 12 15.6ZM11.4 13.6H12.6V10.4H11.4V13.6Z" fill="#212121"/>
</g>
<defs>
<clipPath id="clip0_6013_33858">
<rect width="24" height="24" fill="white"/>
</clipPath>
</defs>`):(Z.innerHTML=`<g clip-path="url(#clip0_6083_34804)">
<path d="M11.4 15.2H12.6V11.2H11.4V15.2ZM12 10C12.1667 10 12.3056 9.94444 12.4167 9.83333C12.5389 9.71111 12.6 9.56667 12.6 9.4C12.6 9.23333 12.5389 9.09444 12.4167 8.98333C12.3056 8.86111 12.1667 8.8 12 8.8C11.8333 8.8 11.6889 8.86111 11.5667 8.98333C11.4556 9.09444 11.4 9.23333 11.4 9.4C11.4 9.56667 11.4556 9.71111 11.5667 9.83333C11.6889 9.94444 11.8333 10 12 10ZM12 18.4C11.1222 18.4 10.2944 18.2333 9.51667 17.9C8.73889 17.5667 8.05556 17.1111 7.46667 16.5333C6.88889 15.9444 6.43333 15.2611 6.1 14.4833C5.76667 13.7056 5.6 12.8778 5.6 12C5.6 11.1111 5.76667 10.2833 6.1 9.51667C6.43333 8.73889 6.88889 8.06111 7.46667 7.48333C8.05556 6.89444 8.73889 6.43333 9.51667 6.1C10.2944 5.76667 11.1222 5.6 12 5.6C12.8889 5.6 13.7167 5.76667 14.4833 6.1C15.2611 6.43333 15.9389 6.89444 16.5167 7.48333C17.1056 8.06111 17.5667 8.73889 17.9 9.51667C18.2333 10.2833 18.4 11.1111 18.4 12C18.4 12.8778 18.2333 13.7056 17.9 14.4833C17.5667 15.2611 17.1056 15.9444 16.5167 16.5333C15.9389 17.1111 15.2611 17.5667 14.4833 17.9C13.7167 18.2333 12.8889 18.4 12 18.4ZM12 17.2C13.4444 17.2 14.6722 16.6944 15.6833 15.6833C16.6944 14.6722 17.2 13.4444 17.2 12C17.2 10.5556 16.6944 9.32778 15.6833 8.31667C14.6722 7.30555 13.4444 6.8 12 6.8C10.5556 6.8 9.32778 7.30555 8.31667 8.31667C7.30556 9.32778 6.8 10.5556 6.8 12C6.8 13.4444 7.30556 14.6722 8.31667 15.6833C9.32778 16.6944 10.5556 17.2 12 17.2Z" fill="#212121"/>
</g>
<defs>
<clipPath id="clip0_6083_34804">
<rect width="24" height="24" fill="white"/>
</clipPath>
</defs>`,_.innerText="Preview backend running in this workspace."),_.setAttribute("id",p)}document.readyState==="loading"?window.addEventListener("DOMContentLoaded",u):u()}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Mo(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function $i(){return typeof window<"u"&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(Mo())}function Lo(){return typeof navigator=="object"&&navigator.product==="ReactNative"}function Fo(){return Pi.NODE_ADMIN===!0}function $o(){try{return typeof indexedDB=="object"}catch{return!1}}function Bo(){return new Promise((n,e)=>{try{let t=!0;const s="validate-browser-context-for-indexeddb-analytics-module",i=self.indexedDB.open(s);i.onsuccess=()=>{i.result.close(),t||self.indexedDB.deleteDatabase(s),n(!0)},i.onupgradeneeded=()=>{t=!1},i.onerror=()=>{var r;e(((r=i.error)===null||r===void 0?void 0:r.message)||"")}}catch(t){e(t)}})}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Wo="FirebaseError";class yt extends Error{constructor(e,t,s){super(t),this.code=e,this.customData=s,this.name=Wo,Object.setPrototypeOf(this,yt.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,Bi.prototype.create)}}class Bi{constructor(e,t,s){this.service=e,this.serviceName=t,this.errors=s}create(e,...t){const s=t[0]||{},i=`${this.service}/${e}`,r=this.errors[e],o=r?Uo(r,s):"Error",a=`${this.serviceName}: ${o} (${i}).`;return new yt(i,a,s)}}function Uo(n,e){return n.replace(Ho,(t,s)=>{const i=e[s];return i!=null?String(i):`<${s}?>`})}const Ho=/\{\$([^}]+)}/g;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function at(n){return JSON.parse(n)}function x(n){return JSON.stringify(n)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Wi=function(n){let e={},t={},s={},i="";try{const r=n.split(".");e=at(Nn(r[0])||""),t=at(Nn(r[1])||""),i=r[2],s=t.d||{},delete t.d}catch{}return{header:e,claims:t,data:s,signature:i}},jo=function(n){const e=Wi(n),t=e.claims;return!!t&&typeof t=="object"&&t.hasOwnProperty("iat")},Vo=function(n){const e=Wi(n).claims;return typeof e=="object"&&e.admin===!0};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Q(n,e){return Object.prototype.hasOwnProperty.call(n,e)}function be(n,e){if(Object.prototype.hasOwnProperty.call(n,e))return n[e]}function kn(n){for(const e in n)if(Object.prototype.hasOwnProperty.call(n,e))return!1;return!0}function Pt(n,e,t){const s={};for(const i in n)Object.prototype.hasOwnProperty.call(n,i)&&(s[i]=e.call(t,n[i],i,n));return s}function Ot(n,e){if(n===e)return!0;const t=Object.keys(n),s=Object.keys(e);for(const i of t){if(!s.includes(i))return!1;const r=n[i],o=e[i];if($s(r)&&$s(o)){if(!Ot(r,o))return!1}else if(r!==o)return!1}for(const i of s)if(!t.includes(i))return!1;return!0}function $s(n){return n!==null&&typeof n=="object"}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Go(n){const e=[];for(const[t,s]of Object.entries(n))Array.isArray(s)?s.forEach(i=>{e.push(encodeURIComponent(t)+"="+encodeURIComponent(i))}):e.push(encodeURIComponent(t)+"="+encodeURIComponent(s));return e.length?"&"+e.join("&"):""}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class qo{constructor(){this.chain_=[],this.buf_=[],this.W_=[],this.pad_=[],this.inbuf_=0,this.total_=0,this.blockSize=512/8,this.pad_[0]=128;for(let e=1;e<this.blockSize;++e)this.pad_[e]=0;this.reset()}reset(){this.chain_[0]=1732584193,this.chain_[1]=4023233417,this.chain_[2]=2562383102,this.chain_[3]=271733878,this.chain_[4]=3285377520,this.inbuf_=0,this.total_=0}compress_(e,t){t||(t=0);const s=this.W_;if(typeof e=="string")for(let u=0;u<16;u++)s[u]=e.charCodeAt(t)<<24|e.charCodeAt(t+1)<<16|e.charCodeAt(t+2)<<8|e.charCodeAt(t+3),t+=4;else for(let u=0;u<16;u++)s[u]=e[t]<<24|e[t+1]<<16|e[t+2]<<8|e[t+3],t+=4;for(let u=16;u<80;u++){const h=s[u-3]^s[u-8]^s[u-14]^s[u-16];s[u]=(h<<1|h>>>31)&4294967295}let i=this.chain_[0],r=this.chain_[1],o=this.chain_[2],a=this.chain_[3],l=this.chain_[4],c,d;for(let u=0;u<80;u++){u<40?u<20?(c=a^r&(o^a),d=1518500249):(c=r^o^a,d=1859775393):u<60?(c=r&o|a&(r|o),d=2400959708):(c=r^o^a,d=3395469782);const h=(i<<5|i>>>27)+c+l+d+s[u]&4294967295;l=a,a=o,o=(r<<30|r>>>2)&4294967295,r=i,i=h}this.chain_[0]=this.chain_[0]+i&4294967295,this.chain_[1]=this.chain_[1]+r&4294967295,this.chain_[2]=this.chain_[2]+o&4294967295,this.chain_[3]=this.chain_[3]+a&4294967295,this.chain_[4]=this.chain_[4]+l&4294967295}update(e,t){if(e==null)return;t===void 0&&(t=e.length);const s=t-this.blockSize;let i=0;const r=this.buf_;let o=this.inbuf_;for(;i<t;){if(o===0)for(;i<=s;)this.compress_(e,i),i+=this.blockSize;if(typeof e=="string"){for(;i<t;)if(r[o]=e.charCodeAt(i),++o,++i,o===this.blockSize){this.compress_(r),o=0;break}}else for(;i<t;)if(r[o]=e[i],++o,++i,o===this.blockSize){this.compress_(r),o=0;break}}this.inbuf_=o,this.total_+=t}digest(){const e=[];let t=this.total_*8;this.inbuf_<56?this.update(this.pad_,56-this.inbuf_):this.update(this.pad_,this.blockSize-(this.inbuf_-56));for(let i=this.blockSize-1;i>=56;i--)this.buf_[i]=t&255,t/=256;this.compress_(this.buf_);let s=0;for(let i=0;i<5;i++)for(let r=24;r>=0;r-=8)e[s]=this.chain_[i]>>r&255,++s;return e}}function Fe(n,e){return`${n} failed: ${e} argument `}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const zo=function(n){const e=[];let t=0;for(let s=0;s<n.length;s++){let i=n.charCodeAt(s);if(i>=55296&&i<=56319){const r=i-55296;s++,f(s<n.length,"Surrogate pair missing trail surrogate.");const o=n.charCodeAt(s)-56320;i=65536+(r<<10)+o}i<128?e[t++]=i:i<2048?(e[t++]=i>>6|192,e[t++]=i&63|128):i<65536?(e[t++]=i>>12|224,e[t++]=i>>6&63|128,e[t++]=i&63|128):(e[t++]=i>>18|240,e[t++]=i>>12&63|128,e[t++]=i>>6&63|128,e[t++]=i&63|128)}return e},Xt=function(n){let e=0;for(let t=0;t<n.length;t++){const s=n.charCodeAt(t);s<128?e++:s<2048?e+=2:s>=55296&&s<=56319?(e+=4,t++):e+=3}return e};/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function _e(n){return n&&n._delegate?n._delegate:n}class lt{constructor(e,t,s){this.name=e,this.instanceFactory=t,this.type=s,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(e){return this.instantiationMode=e,this}setMultipleInstances(e){return this.multipleInstances=e,this}setServiceProps(e){return this.serviceProps=e,this}setInstanceCreatedCallback(e){return this.onInstanceCreated=e,this}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ge="[DEFAULT]";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Yo{constructor(e,t){this.name=e,this.container=t,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(e){const t=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(t)){const s=new G;if(this.instancesDeferred.set(t,s),this.isInitialized(t)||this.shouldAutoInitialize())try{const i=this.getOrInitializeService({instanceIdentifier:t});i&&s.resolve(i)}catch{}}return this.instancesDeferred.get(t).promise}getImmediate(e){var t;const s=this.normalizeInstanceIdentifier(e==null?void 0:e.identifier),i=(t=e==null?void 0:e.optional)!==null&&t!==void 0?t:!1;if(this.isInitialized(s)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:s})}catch(r){if(i)return null;throw r}else{if(i)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(e){if(e.name!==this.name)throw Error(`Mismatching Component ${e.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=e,!!this.shouldAutoInitialize()){if(Qo(e))try{this.getOrInitializeService({instanceIdentifier:ge})}catch{}for(const[t,s]of this.instancesDeferred.entries()){const i=this.normalizeInstanceIdentifier(t);try{const r=this.getOrInitializeService({instanceIdentifier:i});s.resolve(r)}catch{}}}}clearInstance(e=ge){this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}async delete(){const e=Array.from(this.instances.values());await Promise.all([...e.filter(t=>"INTERNAL"in t).map(t=>t.INTERNAL.delete()),...e.filter(t=>"_delete"in t).map(t=>t._delete())])}isComponentSet(){return this.component!=null}isInitialized(e=ge){return this.instances.has(e)}getOptions(e=ge){return this.instancesOptions.get(e)||{}}initialize(e={}){const{options:t={}}=e,s=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(s))throw Error(`${this.name}(${s}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const i=this.getOrInitializeService({instanceIdentifier:s,options:t});for(const[r,o]of this.instancesDeferred.entries()){const a=this.normalizeInstanceIdentifier(r);s===a&&o.resolve(i)}return i}onInit(e,t){var s;const i=this.normalizeInstanceIdentifier(t),r=(s=this.onInitCallbacks.get(i))!==null&&s!==void 0?s:new Set;r.add(e),this.onInitCallbacks.set(i,r);const o=this.instances.get(i);return o&&e(o,i),()=>{r.delete(e)}}invokeOnInitCallbacks(e,t){const s=this.onInitCallbacks.get(t);if(s)for(const i of s)try{i(e,t)}catch{}}getOrInitializeService({instanceIdentifier:e,options:t={}}){let s=this.instances.get(e);if(!s&&this.component&&(s=this.component.instanceFactory(this.container,{instanceIdentifier:Ko(e),options:t}),this.instances.set(e,s),this.instancesOptions.set(e,t),this.invokeOnInitCallbacks(s,e),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,e,s)}catch{}return s||null}normalizeInstanceIdentifier(e=ge){return this.component?this.component.multipleInstances?e:ge:e}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function Ko(n){return n===ge?void 0:n}function Qo(n){return n.instantiationMode==="EAGER"}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Xo{constructor(e){this.name=e,this.providers=new Map}addComponent(e){const t=this.getProvider(e.name);if(t.isComponentSet())throw new Error(`Component ${e.name} has already been registered with ${this.name}`);t.setComponent(e)}addOrOverwriteComponent(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}getProvider(e){if(this.providers.has(e))return this.providers.get(e);const t=new Yo(e,this);return this.providers.set(e,t),t}getProviders(){return Array.from(this.providers.values())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var k;(function(n){n[n.DEBUG=0]="DEBUG",n[n.VERBOSE=1]="VERBOSE",n[n.INFO=2]="INFO",n[n.WARN=3]="WARN",n[n.ERROR=4]="ERROR",n[n.SILENT=5]="SILENT"})(k||(k={}));const Jo={debug:k.DEBUG,verbose:k.VERBOSE,info:k.INFO,warn:k.WARN,error:k.ERROR,silent:k.SILENT},Zo=k.INFO,ea={[k.DEBUG]:"log",[k.VERBOSE]:"log",[k.INFO]:"info",[k.WARN]:"warn",[k.ERROR]:"error"},ta=(n,e,...t)=>{if(e<n.logLevel)return;const s=new Date().toISOString(),i=ea[e];if(i)console[i](`[${s}]  ${n.name}:`,...t);else throw new Error(`Attempted to log a message with an invalid logType (value: ${e})`)};class Ui{constructor(e){this.name=e,this._logLevel=Zo,this._logHandler=ta,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(e){if(!(e in k))throw new TypeError(`Invalid value "${e}" assigned to \`logLevel\``);this._logLevel=e}setLogLevel(e){this._logLevel=typeof e=="string"?Jo[e]:e}get logHandler(){return this._logHandler}set logHandler(e){if(typeof e!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}get userLogHandler(){return this._userLogHandler}set userLogHandler(e){this._userLogHandler=e}debug(...e){this._userLogHandler&&this._userLogHandler(this,k.DEBUG,...e),this._logHandler(this,k.DEBUG,...e)}log(...e){this._userLogHandler&&this._userLogHandler(this,k.VERBOSE,...e),this._logHandler(this,k.VERBOSE,...e)}info(...e){this._userLogHandler&&this._userLogHandler(this,k.INFO,...e),this._logHandler(this,k.INFO,...e)}warn(...e){this._userLogHandler&&this._userLogHandler(this,k.WARN,...e),this._logHandler(this,k.WARN,...e)}error(...e){this._userLogHandler&&this._userLogHandler(this,k.ERROR,...e),this._logHandler(this,k.ERROR,...e)}}const na=(n,e)=>e.some(t=>n instanceof t);let Bs,Ws;function sa(){return Bs||(Bs=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function ia(){return Ws||(Ws=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const Hi=new WeakMap,An=new WeakMap,ji=new WeakMap,_n=new WeakMap,Jn=new WeakMap;function ra(n){const e=new Promise((t,s)=>{const i=()=>{n.removeEventListener("success",r),n.removeEventListener("error",o)},r=()=>{t(ae(n.result)),i()},o=()=>{s(n.error),i()};n.addEventListener("success",r),n.addEventListener("error",o)});return e.then(t=>{t instanceof IDBCursor&&Hi.set(t,n)}).catch(()=>{}),Jn.set(e,n),e}function oa(n){if(An.has(n))return;const e=new Promise((t,s)=>{const i=()=>{n.removeEventListener("complete",r),n.removeEventListener("error",o),n.removeEventListener("abort",o)},r=()=>{t(),i()},o=()=>{s(n.error||new DOMException("AbortError","AbortError")),i()};n.addEventListener("complete",r),n.addEventListener("error",o),n.addEventListener("abort",o)});An.set(n,e)}let Dn={get(n,e,t){if(n instanceof IDBTransaction){if(e==="done")return An.get(n);if(e==="objectStoreNames")return n.objectStoreNames||ji.get(n);if(e==="store")return t.objectStoreNames[1]?void 0:t.objectStore(t.objectStoreNames[0])}return ae(n[e])},set(n,e,t){return n[e]=t,!0},has(n,e){return n instanceof IDBTransaction&&(e==="done"||e==="store")?!0:e in n}};function aa(n){Dn=n(Dn)}function la(n){return n===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(e,...t){const s=n.call(mn(this),e,...t);return ji.set(s,e.sort?e.sort():[e]),ae(s)}:ia().includes(n)?function(...e){return n.apply(mn(this),e),ae(Hi.get(this))}:function(...e){return ae(n.apply(mn(this),e))}}function ca(n){return typeof n=="function"?la(n):(n instanceof IDBTransaction&&oa(n),na(n,sa())?new Proxy(n,Dn):n)}function ae(n){if(n instanceof IDBRequest)return ra(n);if(_n.has(n))return _n.get(n);const e=ca(n);return e!==n&&(_n.set(n,e),Jn.set(e,n)),e}const mn=n=>Jn.get(n);function ua(n,e,{blocked:t,upgrade:s,blocking:i,terminated:r}={}){const o=indexedDB.open(n,e),a=ae(o);return s&&o.addEventListener("upgradeneeded",l=>{s(ae(o.result),l.oldVersion,l.newVersion,ae(o.transaction),l)}),t&&o.addEventListener("blocked",l=>t(l.oldVersion,l.newVersion,l)),a.then(l=>{r&&l.addEventListener("close",()=>r()),i&&l.addEventListener("versionchange",c=>i(c.oldVersion,c.newVersion,c))}).catch(()=>{}),a}const ha=["get","getKey","getAll","getAllKeys","count"],da=["put","add","delete","clear"],gn=new Map;function Us(n,e){if(!(n instanceof IDBDatabase&&!(e in n)&&typeof e=="string"))return;if(gn.get(e))return gn.get(e);const t=e.replace(/FromIndex$/,""),s=e!==t,i=da.includes(t);if(!(t in(s?IDBIndex:IDBObjectStore).prototype)||!(i||ha.includes(t)))return;const r=async function(o,...a){const l=this.transaction(o,i?"readwrite":"readonly");let c=l.store;return s&&(c=c.index(a.shift())),(await Promise.all([c[t](...a),i&&l.done]))[0]};return gn.set(e,r),r}aa(n=>({...n,get:(e,t,s)=>Us(e,t)||n.get(e,t,s),has:(e,t)=>!!Us(e,t)||n.has(e,t)}));/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class fa{constructor(e){this.container=e}getPlatformInfoString(){return this.container.getProviders().map(t=>{if(pa(t)){const s=t.getImmediate();return`${s.library}/${s.version}`}else return null}).filter(t=>t).join(" ")}}function pa(n){const e=n.getComponent();return(e==null?void 0:e.type)==="VERSION"}const Pn="@firebase/app",Hs="0.13.2";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const se=new Ui("@firebase/app"),_a="@firebase/app-compat",ma="@firebase/analytics-compat",ga="@firebase/analytics",ya="@firebase/app-check-compat",va="@firebase/app-check",Ca="@firebase/auth",ba="@firebase/auth-compat",Ea="@firebase/database",wa="@firebase/data-connect",Ia="@firebase/database-compat",Sa="@firebase/functions",Ta="@firebase/functions-compat",Ra="@firebase/installations",Na="@firebase/installations-compat",ka="@firebase/messaging",Aa="@firebase/messaging-compat",Da="@firebase/performance",Pa="@firebase/performance-compat",Oa="@firebase/remote-config",xa="@firebase/remote-config-compat",Ma="@firebase/storage",La="@firebase/storage-compat",Fa="@firebase/firestore",$a="@firebase/ai",Ba="@firebase/firestore-compat",Wa="firebase",Ua="11.10.0";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const On="[DEFAULT]",Ha={[Pn]:"fire-core",[_a]:"fire-core-compat",[ga]:"fire-analytics",[ma]:"fire-analytics-compat",[va]:"fire-app-check",[ya]:"fire-app-check-compat",[Ca]:"fire-auth",[ba]:"fire-auth-compat",[Ea]:"fire-rtdb",[wa]:"fire-data-connect",[Ia]:"fire-rtdb-compat",[Sa]:"fire-fn",[Ta]:"fire-fn-compat",[Ra]:"fire-iid",[Na]:"fire-iid-compat",[ka]:"fire-fcm",[Aa]:"fire-fcm-compat",[Da]:"fire-perf",[Pa]:"fire-perf-compat",[Oa]:"fire-rc",[xa]:"fire-rc-compat",[Ma]:"fire-gcs",[La]:"fire-gcs-compat",[Fa]:"fire-fst",[Ba]:"fire-fst-compat",[$a]:"fire-vertex","fire-js":"fire-js",[Wa]:"fire-js-all"};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const xt=new Map,ja=new Map,xn=new Map;function js(n,e){try{n.container.addComponent(e)}catch(t){se.debug(`Component ${e.name} failed to register with FirebaseApp ${n.name}`,t)}}function Mt(n){const e=n.name;if(xn.has(e))return se.debug(`There were multiple attempts to register component ${e}.`),!1;xn.set(e,n);for(const t of xt.values())js(t,n);for(const t of ja.values())js(t,n);return!0}function Va(n,e){const t=n.container.getProvider("heartbeat").getImmediate({optional:!0});return t&&t.triggerHeartbeat(),n.container.getProvider(e)}function Ga(n){return n==null?!1:n.settings!==void 0}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const qa={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},le=new Bi("app","Firebase",qa);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class za{constructor(e,t,s){this._isDeleted=!1,this._options=Object.assign({},e),this._config=Object.assign({},t),this._name=t.name,this._automaticDataCollectionEnabled=t.automaticDataCollectionEnabled,this._container=s,this.container.addComponent(new lt("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(e){this._isDeleted=e}checkDestroyed(){if(this.isDeleted)throw le.create("app-deleted",{appName:this._name})}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ya=Ua;function Vi(n,e={}){let t=n;typeof e!="object"&&(e={name:e});const s=Object.assign({name:On,automaticDataCollectionEnabled:!0},e),i=s.name;if(typeof i!="string"||!i)throw le.create("bad-app-name",{appName:String(i)});if(t||(t=Fi()),!t)throw le.create("no-options");const r=xt.get(i);if(r){if(Ot(t,r.options)&&Ot(s,r.config))return r;throw le.create("duplicate-app",{appName:i})}const o=new Xo(i);for(const l of xn.values())o.addComponent(l);const a=new za(t,s,o);return xt.set(i,a),a}function Ka(n=On){const e=xt.get(n);if(!e&&n===On&&Fi())return Vi();if(!e)throw le.create("no-app",{appName:n});return e}function xe(n,e,t){var s;let i=(s=Ha[n])!==null&&s!==void 0?s:n;t&&(i+=`-${t}`);const r=i.match(/\s|\//),o=e.match(/\s|\//);if(r||o){const a=[`Unable to register library "${i}" with version "${e}":`];r&&a.push(`library name "${i}" contains illegal characters (whitespace or "/")`),r&&o&&a.push("and"),o&&a.push(`version name "${e}" contains illegal characters (whitespace or "/")`),se.warn(a.join(" "));return}Mt(new lt(`${i}-version`,()=>({library:i,version:e}),"VERSION"))}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Qa="firebase-heartbeat-database",Xa=1,ct="firebase-heartbeat-store";let yn=null;function Gi(){return yn||(yn=ua(Qa,Xa,{upgrade:(n,e)=>{switch(e){case 0:try{n.createObjectStore(ct)}catch(t){console.warn(t)}}}}).catch(n=>{throw le.create("idb-open",{originalErrorMessage:n.message})})),yn}async function Ja(n){try{const t=(await Gi()).transaction(ct),s=await t.objectStore(ct).get(qi(n));return await t.done,s}catch(e){if(e instanceof yt)se.warn(e.message);else{const t=le.create("idb-get",{originalErrorMessage:e==null?void 0:e.message});se.warn(t.message)}}}async function Vs(n,e){try{const s=(await Gi()).transaction(ct,"readwrite");await s.objectStore(ct).put(e,qi(n)),await s.done}catch(t){if(t instanceof yt)se.warn(t.message);else{const s=le.create("idb-set",{originalErrorMessage:t==null?void 0:t.message});se.warn(s.message)}}}function qi(n){return`${n.name}!${n.options.appId}`}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Za=1024,el=30;class tl{constructor(e){this.container=e,this._heartbeatsCache=null;const t=this.container.getProvider("app").getImmediate();this._storage=new sl(t),this._heartbeatsCachePromise=this._storage.read().then(s=>(this._heartbeatsCache=s,s))}async triggerHeartbeat(){var e,t;try{const i=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),r=Gs();if(((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((t=this._heartbeatsCache)===null||t===void 0?void 0:t.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===r||this._heartbeatsCache.heartbeats.some(o=>o.date===r))return;if(this._heartbeatsCache.heartbeats.push({date:r,agent:i}),this._heartbeatsCache.heartbeats.length>el){const o=il(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(o,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(s){se.warn(s)}}async getHeartbeatsHeader(){var e;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";const t=Gs(),{heartbeatsToSend:s,unsentEntries:i}=nl(this._heartbeatsCache.heartbeats),r=Dt(JSON.stringify({version:2,heartbeats:s}));return this._heartbeatsCache.lastSentHeartbeatDate=t,i.length>0?(this._heartbeatsCache.heartbeats=i,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),r}catch(t){return se.warn(t),""}}}function Gs(){return new Date().toISOString().substring(0,10)}function nl(n,e=Za){const t=[];let s=n.slice();for(const i of n){const r=t.find(o=>o.agent===i.agent);if(r){if(r.dates.push(i.date),qs(t)>e){r.dates.pop();break}}else if(t.push({agent:i.agent,dates:[i.date]}),qs(t)>e){t.pop();break}s=s.slice(1)}return{heartbeatsToSend:t,unsentEntries:s}}class sl{constructor(e){this.app=e,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return $o()?Bo().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const t=await Ja(this.app);return t!=null&&t.heartbeats?t:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(e){var t;if(await this._canUseIndexedDBPromise){const i=await this.read();return Vs(this.app,{lastSentHeartbeatDate:(t=e.lastSentHeartbeatDate)!==null&&t!==void 0?t:i.lastSentHeartbeatDate,heartbeats:e.heartbeats})}else return}async add(e){var t;if(await this._canUseIndexedDBPromise){const i=await this.read();return Vs(this.app,{lastSentHeartbeatDate:(t=e.lastSentHeartbeatDate)!==null&&t!==void 0?t:i.lastSentHeartbeatDate,heartbeats:[...i.heartbeats,...e.heartbeats]})}else return}}function qs(n){return Dt(JSON.stringify({version:2,heartbeats:n})).length}function il(n){if(n.length===0)return-1;let e=0,t=n[0].date;for(let s=1;s<n.length;s++)n[s].date<t&&(t=n[s].date,e=s);return e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function rl(n){Mt(new lt("platform-logger",e=>new fa(e),"PRIVATE")),Mt(new lt("heartbeat",e=>new tl(e),"PRIVATE")),xe(Pn,Hs,n),xe(Pn,Hs,"esm2017"),xe("fire-js","")}rl("");var zs={};const Ys="@firebase/database",Ks="1.0.20";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let zi="";function ol(n){zi=n}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class al{constructor(e){this.domStorage_=e,this.prefix_="firebase:"}set(e,t){t==null?this.domStorage_.removeItem(this.prefixedName_(e)):this.domStorage_.setItem(this.prefixedName_(e),x(t))}get(e){const t=this.domStorage_.getItem(this.prefixedName_(e));return t==null?null:at(t)}remove(e){this.domStorage_.removeItem(this.prefixedName_(e))}prefixedName_(e){return this.prefix_+e}toString(){return this.domStorage_.toString()}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ll{constructor(){this.cache_={},this.isInMemoryStorage=!0}set(e,t){t==null?delete this.cache_[e]:this.cache_[e]=t}get(e){return Q(this.cache_,e)?this.cache_[e]:null}remove(e){delete this.cache_[e]}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Yi=function(n){try{if(typeof window<"u"&&typeof window[n]<"u"){const e=window[n];return e.setItem("firebase:sentinel","cache"),e.removeItem("firebase:sentinel"),new al(e)}}catch{}return new ll},Ce=Yi("localStorage"),cl=Yi("sessionStorage");/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Me=new Ui("@firebase/database"),Ki=(function(){let n=1;return function(){return n++}})(),Qi=function(n){const e=zo(n),t=new qo;t.update(e);const s=t.digest();return Qn.encodeByteArray(s)},vt=function(...n){let e="";for(let t=0;t<n.length;t++){const s=n[t];Array.isArray(s)||s&&typeof s=="object"&&typeof s.length=="number"?e+=vt.apply(null,s):typeof s=="object"?e+=x(s):e+=s,e+=" "}return e};let tt=null,Qs=!0;const ul=function(n,e){f(!0,"Can't turn on custom loggers persistently."),Me.logLevel=k.VERBOSE,tt=Me.log.bind(Me)},F=function(...n){if(Qs===!0&&(Qs=!1,tt===null&&cl.get("logging_enabled")===!0&&ul()),tt){const e=vt.apply(null,n);tt(e)}},Ct=function(n){return function(...e){F(n,...e)}},Mn=function(...n){const e="FIREBASE INTERNAL ERROR: "+vt(...n);Me.error(e)},ie=function(...n){const e=`FIREBASE FATAL ERROR: ${vt(...n)}`;throw Me.error(e),new Error(e)},W=function(...n){const e="FIREBASE WARNING: "+vt(...n);Me.warn(e)},hl=function(){typeof window<"u"&&window.location&&window.location.protocol&&window.location.protocol.indexOf("https:")!==-1&&W("Insecure Firebase access from a secure page. Please use https in calls to new Firebase().")},Jt=function(n){return typeof n=="number"&&(n!==n||n===Number.POSITIVE_INFINITY||n===Number.NEGATIVE_INFINITY)},dl=function(n){if(document.readyState==="complete")n();else{let e=!1;const t=function(){if(!document.body){setTimeout(t,Math.floor(10));return}e||(e=!0,n())};document.addEventListener?(document.addEventListener("DOMContentLoaded",t,!1),window.addEventListener("load",t,!1)):document.attachEvent&&(document.attachEvent("onreadystatechange",()=>{document.readyState==="complete"&&t()}),window.attachEvent("onload",t))}},$e="[MIN_NAME]",Ee="[MAX_NAME]",Te=function(n,e){if(n===e)return 0;if(n===$e||e===Ee)return-1;if(e===$e||n===Ee)return 1;{const t=Xs(n),s=Xs(e);return t!==null?s!==null?t-s===0?n.length-e.length:t-s:-1:s!==null?1:n<e?-1:1}},fl=function(n,e){return n===e?0:n<e?-1:1},Ke=function(n,e){if(e&&n in e)return e[n];throw new Error("Missing required key ("+n+") in object: "+x(e))},Zn=function(n){if(typeof n!="object"||n===null)return x(n);const e=[];for(const s in n)e.push(s);e.sort();let t="{";for(let s=0;s<e.length;s++)s!==0&&(t+=","),t+=x(e[s]),t+=":",t+=Zn(n[e[s]]);return t+="}",t},Xi=function(n,e){const t=n.length;if(t<=e)return[n];const s=[];for(let i=0;i<t;i+=e)i+e>t?s.push(n.substring(i,t)):s.push(n.substring(i,i+e));return s};function $(n,e){for(const t in n)n.hasOwnProperty(t)&&e(t,n[t])}const Ji=function(n){f(!Jt(n),"Invalid JSON number");const e=11,t=52,s=(1<<e-1)-1;let i,r,o,a,l;n===0?(r=0,o=0,i=1/n===-1/0?1:0):(i=n<0,n=Math.abs(n),n>=Math.pow(2,1-s)?(a=Math.min(Math.floor(Math.log(n)/Math.LN2),s),r=a+s,o=Math.round(n*Math.pow(2,t-a)-Math.pow(2,t))):(r=0,o=Math.round(n/Math.pow(2,1-s-t))));const c=[];for(l=t;l;l-=1)c.push(o%2?1:0),o=Math.floor(o/2);for(l=e;l;l-=1)c.push(r%2?1:0),r=Math.floor(r/2);c.push(i?1:0),c.reverse();const d=c.join("");let u="";for(l=0;l<64;l+=8){let h=parseInt(d.substr(l,8),2).toString(16);h.length===1&&(h="0"+h),u=u+h}return u.toLowerCase()},pl=function(){return!!(typeof window=="object"&&window.chrome&&window.chrome.extension&&!/^chrome/.test(window.location.href))},_l=function(){return typeof Windows=="object"&&typeof Windows.UI=="object"};function ml(n,e){let t="Unknown Error";n==="too_big"?t="The data requested exceeds the maximum size that can be accessed with a single request.":n==="permission_denied"?t="Client doesn't have permission to access the desired data.":n==="unavailable"&&(t="The service is unavailable");const s=new Error(n+" at "+e._path.toString()+": "+t);return s.code=n.toUpperCase(),s}const gl=new RegExp("^-?(0*)\\d{1,10}$"),yl=-2147483648,vl=2147483647,Xs=function(n){if(gl.test(n)){const e=Number(n);if(e>=yl&&e<=vl)return e}return null},Ge=function(n){try{n()}catch(e){setTimeout(()=>{const t=e.stack||"";throw W("Exception was thrown by user callback.",t),e},Math.floor(0))}},Cl=function(){return(typeof window=="object"&&window.navigator&&window.navigator.userAgent||"").search(/googlebot|google webmaster tools|bingbot|yahoo! slurp|baiduspider|yandexbot|duckduckbot/i)>=0},nt=function(n,e){const t=setTimeout(n,e);return typeof t=="number"&&typeof Deno<"u"&&Deno.unrefTimer?Deno.unrefTimer(t):typeof t=="object"&&t.unref&&t.unref(),t};/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class bl{constructor(e,t){this.appCheckProvider=t,this.appName=e.name,Ga(e)&&e.settings.appCheckToken&&(this.serverAppAppCheckToken=e.settings.appCheckToken),this.appCheck=t==null?void 0:t.getImmediate({optional:!0}),this.appCheck||t==null||t.get().then(s=>this.appCheck=s)}getToken(e){if(this.serverAppAppCheckToken){if(e)throw new Error("Attempted reuse of `FirebaseServerApp.appCheckToken` after previous usage failed.");return Promise.resolve({token:this.serverAppAppCheckToken})}return this.appCheck?this.appCheck.getToken(e):new Promise((t,s)=>{setTimeout(()=>{this.appCheck?this.getToken(e).then(t,s):t(null)},0)})}addTokenChangeListener(e){var t;(t=this.appCheckProvider)===null||t===void 0||t.get().then(s=>s.addTokenListener(e))}notifyForInvalidToken(){W(`Provided AppCheck credentials for the app named "${this.appName}" are invalid. This usually indicates your app was not initialized correctly.`)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class El{constructor(e,t,s){this.appName_=e,this.firebaseOptions_=t,this.authProvider_=s,this.auth_=null,this.auth_=s.getImmediate({optional:!0}),this.auth_||s.onInit(i=>this.auth_=i)}getToken(e){return this.auth_?this.auth_.getToken(e).catch(t=>t&&t.code==="auth/token-not-initialized"?(F("Got auth/token-not-initialized error.  Treating as null token."),null):Promise.reject(t)):new Promise((t,s)=>{setTimeout(()=>{this.auth_?this.getToken(e).then(t,s):t(null)},0)})}addTokenChangeListener(e){this.auth_?this.auth_.addAuthTokenListener(e):this.authProvider_.get().then(t=>t.addAuthTokenListener(e))}removeTokenChangeListener(e){this.authProvider_.get().then(t=>t.removeAuthTokenListener(e))}notifyForInvalidToken(){let e='Provided authentication credentials for the app named "'+this.appName_+'" are invalid. This usually indicates your app was not initialized correctly. ';"credential"in this.firebaseOptions_?e+='Make sure the "credential" property provided to initializeApp() is authorized to access the specified "databaseURL" and is from the correct project.':"serviceAccount"in this.firebaseOptions_?e+='Make sure the "serviceAccount" property provided to initializeApp() is authorized to access the specified "databaseURL" and is from the correct project.':e+='Make sure the "apiKey" and "databaseURL" properties provided to initializeApp() match the values provided for your app at https://console.firebase.google.com/.',W(e)}}class kt{constructor(e){this.accessToken=e}getToken(e){return Promise.resolve({accessToken:this.accessToken})}addTokenChangeListener(e){e(this.accessToken)}removeTokenChangeListener(e){}notifyForInvalidToken(){}}kt.OWNER="owner";/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const es="5",Zi="v",er="s",tr="r",nr="f",sr=/(console\.firebase|firebase-console-\w+\.corp|firebase\.corp)\.google\.com/,ir="ls",rr="p",Ln="ac",or="websocket",ar="long_polling";/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class lr{constructor(e,t,s,i,r=!1,o="",a=!1,l=!1,c=null){this.secure=t,this.namespace=s,this.webSocketOnly=i,this.nodeAdmin=r,this.persistenceKey=o,this.includeNamespaceInQueryParams=a,this.isUsingEmulator=l,this.emulatorOptions=c,this._host=e.toLowerCase(),this._domain=this._host.substr(this._host.indexOf(".")+1),this.internalHost=Ce.get("host:"+e)||this._host}isCacheableHost(){return this.internalHost.substr(0,2)==="s-"}isCustomHost(){return this._domain!=="firebaseio.com"&&this._domain!=="firebaseio-demo.com"}get host(){return this._host}set host(e){e!==this.internalHost&&(this.internalHost=e,this.isCacheableHost()&&Ce.set("host:"+this._host,this.internalHost))}toString(){let e=this.toURLString();return this.persistenceKey&&(e+="<"+this.persistenceKey+">"),e}toURLString(){const e=this.secure?"https://":"http://",t=this.includeNamespaceInQueryParams?`?ns=${this.namespace}`:"";return`${e}${this.host}/${t}`}}function wl(n){return n.host!==n.internalHost||n.isCustomHost()||n.includeNamespaceInQueryParams}function cr(n,e,t){f(typeof e=="string","typeof type must == string"),f(typeof t=="object","typeof params must == object");let s;if(e===or)s=(n.secure?"wss://":"ws://")+n.internalHost+"/.ws?";else if(e===ar)s=(n.secure?"https://":"http://")+n.internalHost+"/.lp?";else throw new Error("Unknown connection type: "+e);wl(n)&&(t.ns=n.namespace);const i=[];return $(t,(r,o)=>{i.push(r+"="+o)}),s+i.join("&")}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Il{constructor(){this.counters_={}}incrementCounter(e,t=1){Q(this.counters_,e)||(this.counters_[e]=0),this.counters_[e]+=t}get(){return Eo(this.counters_)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const vn={},Cn={};function ts(n){const e=n.toString();return vn[e]||(vn[e]=new Il),vn[e]}function Sl(n,e){const t=n.toString();return Cn[t]||(Cn[t]=e()),Cn[t]}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Tl{constructor(e){this.onMessage_=e,this.pendingResponses=[],this.currentResponseNum=0,this.closeAfterResponse=-1,this.onClose=null}closeAfter(e,t){this.closeAfterResponse=e,this.onClose=t,this.closeAfterResponse<this.currentResponseNum&&(this.onClose(),this.onClose=null)}handleResponse(e,t){for(this.pendingResponses[e]=t;this.pendingResponses[this.currentResponseNum];){const s=this.pendingResponses[this.currentResponseNum];delete this.pendingResponses[this.currentResponseNum];for(let i=0;i<s.length;++i)s[i]&&Ge(()=>{this.onMessage_(s[i])});if(this.currentResponseNum===this.closeAfterResponse){this.onClose&&(this.onClose(),this.onClose=null);break}this.currentResponseNum++}}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Js="start",Rl="close",Nl="pLPCommand",kl="pRTLPCB",ur="id",hr="pw",dr="ser",Al="cb",Dl="seg",Pl="ts",Ol="d",xl="dframe",fr=1870,pr=30,Ml=fr-pr,Ll=25e3,Fl=3e4;class Pe{constructor(e,t,s,i,r,o,a){this.connId=e,this.repoInfo=t,this.applicationId=s,this.appCheckToken=i,this.authToken=r,this.transportSessionId=o,this.lastSessionId=a,this.bytesSent=0,this.bytesReceived=0,this.everConnected_=!1,this.log_=Ct(e),this.stats_=ts(t),this.urlFn=l=>(this.appCheckToken&&(l[Ln]=this.appCheckToken),cr(t,ar,l))}open(e,t){this.curSegmentNum=0,this.onDisconnect_=t,this.myPacketOrderer=new Tl(e),this.isClosed_=!1,this.connectTimeoutTimer_=setTimeout(()=>{this.log_("Timed out trying to connect."),this.onClosed_(),this.connectTimeoutTimer_=null},Math.floor(Fl)),dl(()=>{if(this.isClosed_)return;this.scriptTagHolder=new ns((...r)=>{const[o,a,l,c,d]=r;if(this.incrementIncomingBytes_(r),!!this.scriptTagHolder)if(this.connectTimeoutTimer_&&(clearTimeout(this.connectTimeoutTimer_),this.connectTimeoutTimer_=null),this.everConnected_=!0,o===Js)this.id=a,this.password=l;else if(o===Rl)a?(this.scriptTagHolder.sendNewPolls=!1,this.myPacketOrderer.closeAfter(a,()=>{this.onClosed_()})):this.onClosed_();else throw new Error("Unrecognized command received: "+o)},(...r)=>{const[o,a]=r;this.incrementIncomingBytes_(r),this.myPacketOrderer.handleResponse(o,a)},()=>{this.onClosed_()},this.urlFn);const s={};s[Js]="t",s[dr]=Math.floor(Math.random()*1e8),this.scriptTagHolder.uniqueCallbackIdentifier&&(s[Al]=this.scriptTagHolder.uniqueCallbackIdentifier),s[Zi]=es,this.transportSessionId&&(s[er]=this.transportSessionId),this.lastSessionId&&(s[ir]=this.lastSessionId),this.applicationId&&(s[rr]=this.applicationId),this.appCheckToken&&(s[Ln]=this.appCheckToken),typeof location<"u"&&location.hostname&&sr.test(location.hostname)&&(s[tr]=nr);const i=this.urlFn(s);this.log_("Connecting via long-poll to "+i),this.scriptTagHolder.addTag(i,()=>{})})}start(){this.scriptTagHolder.startLongPoll(this.id,this.password),this.addDisconnectPingFrame(this.id,this.password)}static forceAllow(){Pe.forceAllow_=!0}static forceDisallow(){Pe.forceDisallow_=!0}static isAvailable(){return Pe.forceAllow_?!0:!Pe.forceDisallow_&&typeof document<"u"&&document.createElement!=null&&!pl()&&!_l()}markConnectionHealthy(){}shutdown_(){this.isClosed_=!0,this.scriptTagHolder&&(this.scriptTagHolder.close(),this.scriptTagHolder=null),this.myDisconnFrame&&(document.body.removeChild(this.myDisconnFrame),this.myDisconnFrame=null),this.connectTimeoutTimer_&&(clearTimeout(this.connectTimeoutTimer_),this.connectTimeoutTimer_=null)}onClosed_(){this.isClosed_||(this.log_("Longpoll is closing itself"),this.shutdown_(),this.onDisconnect_&&(this.onDisconnect_(this.everConnected_),this.onDisconnect_=null))}close(){this.isClosed_||(this.log_("Longpoll is being closed."),this.shutdown_())}send(e){const t=x(e);this.bytesSent+=t.length,this.stats_.incrementCounter("bytes_sent",t.length);const s=xi(t),i=Xi(s,Ml);for(let r=0;r<i.length;r++)this.scriptTagHolder.enqueueSegment(this.curSegmentNum,i.length,i[r]),this.curSegmentNum++}addDisconnectPingFrame(e,t){this.myDisconnFrame=document.createElement("iframe");const s={};s[xl]="t",s[ur]=e,s[hr]=t,this.myDisconnFrame.src=this.urlFn(s),this.myDisconnFrame.style.display="none",document.body.appendChild(this.myDisconnFrame)}incrementIncomingBytes_(e){const t=x(e).length;this.bytesReceived+=t,this.stats_.incrementCounter("bytes_received",t)}}class ns{constructor(e,t,s,i){this.onDisconnect=s,this.urlFn=i,this.outstandingRequests=new Set,this.pendingSegs=[],this.currentSerial=Math.floor(Math.random()*1e8),this.sendNewPolls=!0;{this.uniqueCallbackIdentifier=Ki(),window[Nl+this.uniqueCallbackIdentifier]=e,window[kl+this.uniqueCallbackIdentifier]=t,this.myIFrame=ns.createIFrame_();let r="";this.myIFrame.src&&this.myIFrame.src.substr(0,11)==="javascript:"&&(r='<script>document.domain="'+document.domain+'";<\/script>');const o="<html><body>"+r+"</body></html>";try{this.myIFrame.doc.open(),this.myIFrame.doc.write(o),this.myIFrame.doc.close()}catch(a){F("frame writing exception"),a.stack&&F(a.stack),F(a)}}}static createIFrame_(){const e=document.createElement("iframe");if(e.style.display="none",document.body){document.body.appendChild(e);try{e.contentWindow.document||F("No IE domain setting required")}catch{const s=document.domain;e.src="javascript:void((function(){document.open();document.domain='"+s+"';document.close();})())"}}else throw"Document body has not initialized. Wait to initialize Firebase until after the document is ready.";return e.contentDocument?e.doc=e.contentDocument:e.contentWindow?e.doc=e.contentWindow.document:e.document&&(e.doc=e.document),e}close(){this.alive=!1,this.myIFrame&&(this.myIFrame.doc.body.textContent="",setTimeout(()=>{this.myIFrame!==null&&(document.body.removeChild(this.myIFrame),this.myIFrame=null)},Math.floor(0)));const e=this.onDisconnect;e&&(this.onDisconnect=null,e())}startLongPoll(e,t){for(this.myID=e,this.myPW=t,this.alive=!0;this.newRequest_(););}newRequest_(){if(this.alive&&this.sendNewPolls&&this.outstandingRequests.size<(this.pendingSegs.length>0?2:1)){this.currentSerial++;const e={};e[ur]=this.myID,e[hr]=this.myPW,e[dr]=this.currentSerial;let t=this.urlFn(e),s="",i=0;for(;this.pendingSegs.length>0&&this.pendingSegs[0].d.length+pr+s.length<=fr;){const o=this.pendingSegs.shift();s=s+"&"+Dl+i+"="+o.seg+"&"+Pl+i+"="+o.ts+"&"+Ol+i+"="+o.d,i++}return t=t+s,this.addLongPollTag_(t,this.currentSerial),!0}else return!1}enqueueSegment(e,t,s){this.pendingSegs.push({seg:e,ts:t,d:s}),this.alive&&this.newRequest_()}addLongPollTag_(e,t){this.outstandingRequests.add(t);const s=()=>{this.outstandingRequests.delete(t),this.newRequest_()},i=setTimeout(s,Math.floor(Ll)),r=()=>{clearTimeout(i),s()};this.addTag(e,r)}addTag(e,t){setTimeout(()=>{try{if(!this.sendNewPolls)return;const s=this.myIFrame.doc.createElement("script");s.type="text/javascript",s.async=!0,s.src=e,s.onload=s.onreadystatechange=function(){const i=s.readyState;(!i||i==="loaded"||i==="complete")&&(s.onload=s.onreadystatechange=null,s.parentNode&&s.parentNode.removeChild(s),t())},s.onerror=()=>{F("Long-poll script failed to load: "+e),this.sendNewPolls=!1,this.close()},this.myIFrame.doc.body.appendChild(s)}catch{}},Math.floor(1))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const $l=16384,Bl=45e3;let Lt=null;typeof MozWebSocket<"u"?Lt=MozWebSocket:typeof WebSocket<"u"&&(Lt=WebSocket);class q{constructor(e,t,s,i,r,o,a){this.connId=e,this.applicationId=s,this.appCheckToken=i,this.authToken=r,this.keepaliveTimer=null,this.frames=null,this.totalFrames=0,this.bytesSent=0,this.bytesReceived=0,this.log_=Ct(this.connId),this.stats_=ts(t),this.connURL=q.connectionURL_(t,o,a,i,s),this.nodeAdmin=t.nodeAdmin}static connectionURL_(e,t,s,i,r){const o={};return o[Zi]=es,typeof location<"u"&&location.hostname&&sr.test(location.hostname)&&(o[tr]=nr),t&&(o[er]=t),s&&(o[ir]=s),i&&(o[Ln]=i),r&&(o[rr]=r),cr(e,or,o)}open(e,t){this.onDisconnect=t,this.onMessage=e,this.log_("Websocket connecting to "+this.connURL),this.everConnected_=!1,Ce.set("previous_websocket_failure",!0);try{let s;Fo(),this.mySock=new Lt(this.connURL,[],s)}catch(s){this.log_("Error instantiating WebSocket.");const i=s.message||s.data;i&&this.log_(i),this.onClosed_();return}this.mySock.onopen=()=>{this.log_("Websocket connected."),this.everConnected_=!0},this.mySock.onclose=()=>{this.log_("Websocket connection was disconnected."),this.mySock=null,this.onClosed_()},this.mySock.onmessage=s=>{this.handleIncomingFrame(s)},this.mySock.onerror=s=>{this.log_("WebSocket error.  Closing connection.");const i=s.message||s.data;i&&this.log_(i),this.onClosed_()}}start(){}static forceDisallow(){q.forceDisallow_=!0}static isAvailable(){let e=!1;if(typeof navigator<"u"&&navigator.userAgent){const t=/Android ([0-9]{0,}\.[0-9]{0,})/,s=navigator.userAgent.match(t);s&&s.length>1&&parseFloat(s[1])<4.4&&(e=!0)}return!e&&Lt!==null&&!q.forceDisallow_}static previouslyFailed(){return Ce.isInMemoryStorage||Ce.get("previous_websocket_failure")===!0}markConnectionHealthy(){Ce.remove("previous_websocket_failure")}appendFrame_(e){if(this.frames.push(e),this.frames.length===this.totalFrames){const t=this.frames.join("");this.frames=null;const s=at(t);this.onMessage(s)}}handleNewFrameCount_(e){this.totalFrames=e,this.frames=[]}extractFrameCount_(e){if(f(this.frames===null,"We already have a frame buffer"),e.length<=6){const t=Number(e);if(!isNaN(t))return this.handleNewFrameCount_(t),null}return this.handleNewFrameCount_(1),e}handleIncomingFrame(e){if(this.mySock===null)return;const t=e.data;if(this.bytesReceived+=t.length,this.stats_.incrementCounter("bytes_received",t.length),this.resetKeepAlive(),this.frames!==null)this.appendFrame_(t);else{const s=this.extractFrameCount_(t);s!==null&&this.appendFrame_(s)}}send(e){this.resetKeepAlive();const t=x(e);this.bytesSent+=t.length,this.stats_.incrementCounter("bytes_sent",t.length);const s=Xi(t,$l);s.length>1&&this.sendString_(String(s.length));for(let i=0;i<s.length;i++)this.sendString_(s[i])}shutdown_(){this.isClosed_=!0,this.keepaliveTimer&&(clearInterval(this.keepaliveTimer),this.keepaliveTimer=null),this.mySock&&(this.mySock.close(),this.mySock=null)}onClosed_(){this.isClosed_||(this.log_("WebSocket is closing itself"),this.shutdown_(),this.onDisconnect&&(this.onDisconnect(this.everConnected_),this.onDisconnect=null))}close(){this.isClosed_||(this.log_("WebSocket is being closed"),this.shutdown_())}resetKeepAlive(){clearInterval(this.keepaliveTimer),this.keepaliveTimer=setInterval(()=>{this.mySock&&this.sendString_("0"),this.resetKeepAlive()},Math.floor(Bl))}sendString_(e){try{this.mySock.send(e)}catch(t){this.log_("Exception thrown from WebSocket.send():",t.message||t.data,"Closing connection."),setTimeout(this.onClosed_.bind(this),0)}}}q.responsesRequiredToBeHealthy=2;q.healthyTimeout=3e4;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ut{static get ALL_TRANSPORTS(){return[Pe,q]}static get IS_TRANSPORT_INITIALIZED(){return this.globalTransportInitialized_}constructor(e){this.initTransports_(e)}initTransports_(e){const t=q&&q.isAvailable();let s=t&&!q.previouslyFailed();if(e.webSocketOnly&&(t||W("wss:// URL used, but browser isn't known to support websockets.  Trying anyway."),s=!0),s)this.transports_=[q];else{const i=this.transports_=[];for(const r of ut.ALL_TRANSPORTS)r&&r.isAvailable()&&i.push(r);ut.globalTransportInitialized_=!0}}initialTransport(){if(this.transports_.length>0)return this.transports_[0];throw new Error("No transports available")}upgradeTransport(){return this.transports_.length>1?this.transports_[1]:null}}ut.globalTransportInitialized_=!1;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Wl=6e4,Ul=5e3,Hl=10*1024,jl=100*1024,bn="t",Zs="d",Vl="s",ei="r",Gl="e",ti="o",ni="a",si="n",ii="p",ql="h";class zl{constructor(e,t,s,i,r,o,a,l,c,d){this.id=e,this.repoInfo_=t,this.applicationId_=s,this.appCheckToken_=i,this.authToken_=r,this.onMessage_=o,this.onReady_=a,this.onDisconnect_=l,this.onKill_=c,this.lastSessionId=d,this.connectionCount=0,this.pendingDataMessages=[],this.state_=0,this.log_=Ct("c:"+this.id+":"),this.transportManager_=new ut(t),this.log_("Connection created"),this.start_()}start_(){const e=this.transportManager_.initialTransport();this.conn_=new e(this.nextTransportId_(),this.repoInfo_,this.applicationId_,this.appCheckToken_,this.authToken_,null,this.lastSessionId),this.primaryResponsesRequired_=e.responsesRequiredToBeHealthy||0;const t=this.connReceiver_(this.conn_),s=this.disconnReceiver_(this.conn_);this.tx_=this.conn_,this.rx_=this.conn_,this.secondaryConn_=null,this.isHealthy_=!1,setTimeout(()=>{this.conn_&&this.conn_.open(t,s)},Math.floor(0));const i=e.healthyTimeout||0;i>0&&(this.healthyTimeout_=nt(()=>{this.healthyTimeout_=null,this.isHealthy_||(this.conn_&&this.conn_.bytesReceived>jl?(this.log_("Connection exceeded healthy timeout but has received "+this.conn_.bytesReceived+" bytes.  Marking connection healthy."),this.isHealthy_=!0,this.conn_.markConnectionHealthy()):this.conn_&&this.conn_.bytesSent>Hl?this.log_("Connection exceeded healthy timeout but has sent "+this.conn_.bytesSent+" bytes.  Leaving connection alive."):(this.log_("Closing unhealthy connection after timeout."),this.close()))},Math.floor(i)))}nextTransportId_(){return"c:"+this.id+":"+this.connectionCount++}disconnReceiver_(e){return t=>{e===this.conn_?this.onConnectionLost_(t):e===this.secondaryConn_?(this.log_("Secondary connection lost."),this.onSecondaryConnectionLost_()):this.log_("closing an old connection")}}connReceiver_(e){return t=>{this.state_!==2&&(e===this.rx_?this.onPrimaryMessageReceived_(t):e===this.secondaryConn_?this.onSecondaryMessageReceived_(t):this.log_("message on old connection"))}}sendRequest(e){const t={t:"d",d:e};this.sendData_(t)}tryCleanupConnection(){this.tx_===this.secondaryConn_&&this.rx_===this.secondaryConn_&&(this.log_("cleaning up and promoting a connection: "+this.secondaryConn_.connId),this.conn_=this.secondaryConn_,this.secondaryConn_=null)}onSecondaryControl_(e){if(bn in e){const t=e[bn];t===ni?this.upgradeIfSecondaryHealthy_():t===ei?(this.log_("Got a reset on secondary, closing it"),this.secondaryConn_.close(),(this.tx_===this.secondaryConn_||this.rx_===this.secondaryConn_)&&this.close()):t===ti&&(this.log_("got pong on secondary."),this.secondaryResponsesRequired_--,this.upgradeIfSecondaryHealthy_())}}onSecondaryMessageReceived_(e){const t=Ke("t",e),s=Ke("d",e);if(t==="c")this.onSecondaryControl_(s);else if(t==="d")this.pendingDataMessages.push(s);else throw new Error("Unknown protocol layer: "+t)}upgradeIfSecondaryHealthy_(){this.secondaryResponsesRequired_<=0?(this.log_("Secondary connection is healthy."),this.isHealthy_=!0,this.secondaryConn_.markConnectionHealthy(),this.proceedWithUpgrade_()):(this.log_("sending ping on secondary."),this.secondaryConn_.send({t:"c",d:{t:ii,d:{}}}))}proceedWithUpgrade_(){this.secondaryConn_.start(),this.log_("sending client ack on secondary"),this.secondaryConn_.send({t:"c",d:{t:ni,d:{}}}),this.log_("Ending transmission on primary"),this.conn_.send({t:"c",d:{t:si,d:{}}}),this.tx_=this.secondaryConn_,this.tryCleanupConnection()}onPrimaryMessageReceived_(e){const t=Ke("t",e),s=Ke("d",e);t==="c"?this.onControl_(s):t==="d"&&this.onDataMessage_(s)}onDataMessage_(e){this.onPrimaryResponse_(),this.onMessage_(e)}onPrimaryResponse_(){this.isHealthy_||(this.primaryResponsesRequired_--,this.primaryResponsesRequired_<=0&&(this.log_("Primary connection is healthy."),this.isHealthy_=!0,this.conn_.markConnectionHealthy()))}onControl_(e){const t=Ke(bn,e);if(Zs in e){const s=e[Zs];if(t===ql){const i=Object.assign({},s);this.repoInfo_.isUsingEmulator&&(i.h=this.repoInfo_.host),this.onHandshake_(i)}else if(t===si){this.log_("recvd end transmission on primary"),this.rx_=this.secondaryConn_;for(let i=0;i<this.pendingDataMessages.length;++i)this.onDataMessage_(this.pendingDataMessages[i]);this.pendingDataMessages=[],this.tryCleanupConnection()}else t===Vl?this.onConnectionShutdown_(s):t===ei?this.onReset_(s):t===Gl?Mn("Server Error: "+s):t===ti?(this.log_("got pong on primary."),this.onPrimaryResponse_(),this.sendPingOnPrimaryIfNecessary_()):Mn("Unknown control packet command: "+t)}}onHandshake_(e){const t=e.ts,s=e.v,i=e.h;this.sessionId=e.s,this.repoInfo_.host=i,this.state_===0&&(this.conn_.start(),this.onConnectionEstablished_(this.conn_,t),es!==s&&W("Protocol version mismatch detected"),this.tryStartUpgrade_())}tryStartUpgrade_(){const e=this.transportManager_.upgradeTransport();e&&this.startUpgrade_(e)}startUpgrade_(e){this.secondaryConn_=new e(this.nextTransportId_(),this.repoInfo_,this.applicationId_,this.appCheckToken_,this.authToken_,this.sessionId),this.secondaryResponsesRequired_=e.responsesRequiredToBeHealthy||0;const t=this.connReceiver_(this.secondaryConn_),s=this.disconnReceiver_(this.secondaryConn_);this.secondaryConn_.open(t,s),nt(()=>{this.secondaryConn_&&(this.log_("Timed out trying to upgrade."),this.secondaryConn_.close())},Math.floor(Wl))}onReset_(e){this.log_("Reset packet received.  New host: "+e),this.repoInfo_.host=e,this.state_===1?this.close():(this.closeConnections_(),this.start_())}onConnectionEstablished_(e,t){this.log_("Realtime connection established."),this.conn_=e,this.state_=1,this.onReady_&&(this.onReady_(t,this.sessionId),this.onReady_=null),this.primaryResponsesRequired_===0?(this.log_("Primary connection is healthy."),this.isHealthy_=!0):nt(()=>{this.sendPingOnPrimaryIfNecessary_()},Math.floor(Ul))}sendPingOnPrimaryIfNecessary_(){!this.isHealthy_&&this.state_===1&&(this.log_("sending ping on primary."),this.sendData_({t:"c",d:{t:ii,d:{}}}))}onSecondaryConnectionLost_(){const e=this.secondaryConn_;this.secondaryConn_=null,(this.tx_===e||this.rx_===e)&&this.close()}onConnectionLost_(e){this.conn_=null,!e&&this.state_===0?(this.log_("Realtime connection failed."),this.repoInfo_.isCacheableHost()&&(Ce.remove("host:"+this.repoInfo_.host),this.repoInfo_.internalHost=this.repoInfo_.host)):this.state_===1&&this.log_("Realtime connection lost."),this.close()}onConnectionShutdown_(e){this.log_("Connection shutdown command received. Shutting down..."),this.onKill_&&(this.onKill_(e),this.onKill_=null),this.onDisconnect_=null,this.close()}sendData_(e){if(this.state_!==1)throw"Connection is not connected";this.tx_.send(e)}close(){this.state_!==2&&(this.log_("Closing realtime connection."),this.state_=2,this.closeConnections_(),this.onDisconnect_&&(this.onDisconnect_(),this.onDisconnect_=null))}closeConnections_(){this.log_("Shutting down all connections"),this.conn_&&(this.conn_.close(),this.conn_=null),this.secondaryConn_&&(this.secondaryConn_.close(),this.secondaryConn_=null),this.healthyTimeout_&&(clearTimeout(this.healthyTimeout_),this.healthyTimeout_=null)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class _r{put(e,t,s,i){}merge(e,t,s,i){}refreshAuthToken(e){}refreshAppCheckToken(e){}onDisconnectPut(e,t,s){}onDisconnectMerge(e,t,s){}onDisconnectCancel(e,t){}reportStats(e){}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class mr{constructor(e){this.allowedEvents_=e,this.listeners_={},f(Array.isArray(e)&&e.length>0,"Requires a non-empty array")}trigger(e,...t){if(Array.isArray(this.listeners_[e])){const s=[...this.listeners_[e]];for(let i=0;i<s.length;i++)s[i].callback.apply(s[i].context,t)}}on(e,t,s){this.validateEventType_(e),this.listeners_[e]=this.listeners_[e]||[],this.listeners_[e].push({callback:t,context:s});const i=this.getInitialEvent(e);i&&t.apply(s,i)}off(e,t,s){this.validateEventType_(e);const i=this.listeners_[e]||[];for(let r=0;r<i.length;r++)if(i[r].callback===t&&(!s||s===i[r].context)){i.splice(r,1);return}}validateEventType_(e){f(this.allowedEvents_.find(t=>t===e),"Unknown event: "+e)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ft extends mr{static getInstance(){return new Ft}constructor(){super(["online"]),this.online_=!0,typeof window<"u"&&typeof window.addEventListener<"u"&&!$i()&&(window.addEventListener("online",()=>{this.online_||(this.online_=!0,this.trigger("online",!0))},!1),window.addEventListener("offline",()=>{this.online_&&(this.online_=!1,this.trigger("online",!1))},!1))}getInitialEvent(e){return f(e==="online","Unknown event type: "+e),[this.online_]}currentlyOnline(){return this.online_}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ri=32,oi=768;class I{constructor(e,t){if(t===void 0){this.pieces_=e.split("/");let s=0;for(let i=0;i<this.pieces_.length;i++)this.pieces_[i].length>0&&(this.pieces_[s]=this.pieces_[i],s++);this.pieces_.length=s,this.pieceNum_=0}else this.pieces_=e,this.pieceNum_=t}toString(){let e="";for(let t=this.pieceNum_;t<this.pieces_.length;t++)this.pieces_[t]!==""&&(e+="/"+this.pieces_[t]);return e||"/"}}function w(){return new I("")}function v(n){return n.pieceNum_>=n.pieces_.length?null:n.pieces_[n.pieceNum_]}function he(n){return n.pieces_.length-n.pieceNum_}function S(n){let e=n.pieceNum_;return e<n.pieces_.length&&e++,new I(n.pieces_,e)}function ss(n){return n.pieceNum_<n.pieces_.length?n.pieces_[n.pieces_.length-1]:null}function Yl(n){let e="";for(let t=n.pieceNum_;t<n.pieces_.length;t++)n.pieces_[t]!==""&&(e+="/"+encodeURIComponent(String(n.pieces_[t])));return e||"/"}function ht(n,e=0){return n.pieces_.slice(n.pieceNum_+e)}function gr(n){if(n.pieceNum_>=n.pieces_.length)return null;const e=[];for(let t=n.pieceNum_;t<n.pieces_.length-1;t++)e.push(n.pieces_[t]);return new I(e,0)}function P(n,e){const t=[];for(let s=n.pieceNum_;s<n.pieces_.length;s++)t.push(n.pieces_[s]);if(e instanceof I)for(let s=e.pieceNum_;s<e.pieces_.length;s++)t.push(e.pieces_[s]);else{const s=e.split("/");for(let i=0;i<s.length;i++)s[i].length>0&&t.push(s[i])}return new I(t,0)}function C(n){return n.pieceNum_>=n.pieces_.length}function B(n,e){const t=v(n),s=v(e);if(t===null)return e;if(t===s)return B(S(n),S(e));throw new Error("INTERNAL ERROR: innerPath ("+e+") is not within outerPath ("+n+")")}function Kl(n,e){const t=ht(n,0),s=ht(e,0);for(let i=0;i<t.length&&i<s.length;i++){const r=Te(t[i],s[i]);if(r!==0)return r}return t.length===s.length?0:t.length<s.length?-1:1}function is(n,e){if(he(n)!==he(e))return!1;for(let t=n.pieceNum_,s=e.pieceNum_;t<=n.pieces_.length;t++,s++)if(n.pieces_[t]!==e.pieces_[s])return!1;return!0}function V(n,e){let t=n.pieceNum_,s=e.pieceNum_;if(he(n)>he(e))return!1;for(;t<n.pieces_.length;){if(n.pieces_[t]!==e.pieces_[s])return!1;++t,++s}return!0}class Ql{constructor(e,t){this.errorPrefix_=t,this.parts_=ht(e,0),this.byteLength_=Math.max(1,this.parts_.length);for(let s=0;s<this.parts_.length;s++)this.byteLength_+=Xt(this.parts_[s]);yr(this)}}function Xl(n,e){n.parts_.length>0&&(n.byteLength_+=1),n.parts_.push(e),n.byteLength_+=Xt(e),yr(n)}function Jl(n){const e=n.parts_.pop();n.byteLength_-=Xt(e),n.parts_.length>0&&(n.byteLength_-=1)}function yr(n){if(n.byteLength_>oi)throw new Error(n.errorPrefix_+"has a key path longer than "+oi+" bytes ("+n.byteLength_+").");if(n.parts_.length>ri)throw new Error(n.errorPrefix_+"path specified exceeds the maximum depth that can be written ("+ri+") or object contains a cycle "+ye(n))}function ye(n){return n.parts_.length===0?"":"in property '"+n.parts_.join(".")+"'"}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class rs extends mr{static getInstance(){return new rs}constructor(){super(["visible"]);let e,t;typeof document<"u"&&typeof document.addEventListener<"u"&&(typeof document.hidden<"u"?(t="visibilitychange",e="hidden"):typeof document.mozHidden<"u"?(t="mozvisibilitychange",e="mozHidden"):typeof document.msHidden<"u"?(t="msvisibilitychange",e="msHidden"):typeof document.webkitHidden<"u"&&(t="webkitvisibilitychange",e="webkitHidden")),this.visible_=!0,t&&document.addEventListener(t,()=>{const s=!document[e];s!==this.visible_&&(this.visible_=s,this.trigger("visible",s))},!1)}getInitialEvent(e){return f(e==="visible","Unknown event type: "+e),[this.visible_]}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Qe=1e3,Zl=300*1e3,ai=30*1e3,ec=1.3,tc=3e4,nc="server_kill",li=3;class ne extends _r{constructor(e,t,s,i,r,o,a,l){if(super(),this.repoInfo_=e,this.applicationId_=t,this.onDataUpdate_=s,this.onConnectStatus_=i,this.onServerInfoUpdate_=r,this.authTokenProvider_=o,this.appCheckTokenProvider_=a,this.authOverride_=l,this.id=ne.nextPersistentConnectionId_++,this.log_=Ct("p:"+this.id+":"),this.interruptReasons_={},this.listens=new Map,this.outstandingPuts_=[],this.outstandingGets_=[],this.outstandingPutCount_=0,this.outstandingGetCount_=0,this.onDisconnectRequestQueue_=[],this.connected_=!1,this.reconnectDelay_=Qe,this.maxReconnectDelay_=Zl,this.securityDebugCallback_=null,this.lastSessionId=null,this.establishConnectionTimer_=null,this.visible_=!1,this.requestCBHash_={},this.requestNumber_=0,this.realtime_=null,this.authToken_=null,this.appCheckToken_=null,this.forceTokenRefresh_=!1,this.invalidAuthTokenCount_=0,this.invalidAppCheckTokenCount_=0,this.firstConnection_=!0,this.lastConnectionAttemptTime_=null,this.lastConnectionEstablishedTime_=null,l)throw new Error("Auth override specified in options, but not supported on non Node.js platforms");rs.getInstance().on("visible",this.onVisible_,this),e.host.indexOf("fblocal")===-1&&Ft.getInstance().on("online",this.onOnline_,this)}sendRequest(e,t,s){const i=++this.requestNumber_,r={r:i,a:e,b:t};this.log_(x(r)),f(this.connected_,"sendRequest call when we're not connected not allowed."),this.realtime_.sendRequest(r),s&&(this.requestCBHash_[i]=s)}get(e){this.initConnection_();const t=new G,i={action:"g",request:{p:e._path.toString(),q:e._queryObject},onComplete:o=>{const a=o.d;o.s==="ok"?t.resolve(a):t.reject(a)}};this.outstandingGets_.push(i),this.outstandingGetCount_++;const r=this.outstandingGets_.length-1;return this.connected_&&this.sendGet_(r),t.promise}listen(e,t,s,i){this.initConnection_();const r=e._queryIdentifier,o=e._path.toString();this.log_("Listen called for "+o+" "+r),this.listens.has(o)||this.listens.set(o,new Map),f(e._queryParams.isDefault()||!e._queryParams.loadsAllData(),"listen() called for non-default but complete query"),f(!this.listens.get(o).has(r),"listen() called twice for same path/queryId.");const a={onComplete:i,hashFn:t,query:e,tag:s};this.listens.get(o).set(r,a),this.connected_&&this.sendListen_(a)}sendGet_(e){const t=this.outstandingGets_[e];this.sendRequest("g",t.request,s=>{delete this.outstandingGets_[e],this.outstandingGetCount_--,this.outstandingGetCount_===0&&(this.outstandingGets_=[]),t.onComplete&&t.onComplete(s)})}sendListen_(e){const t=e.query,s=t._path.toString(),i=t._queryIdentifier;this.log_("Listen on "+s+" for "+i);const r={p:s},o="q";e.tag&&(r.q=t._queryObject,r.t=e.tag),r.h=e.hashFn(),this.sendRequest(o,r,a=>{const l=a.d,c=a.s;ne.warnOnListenWarnings_(l,t),(this.listens.get(s)&&this.listens.get(s).get(i))===e&&(this.log_("listen response",a),c!=="ok"&&this.removeListen_(s,i),e.onComplete&&e.onComplete(c,l))})}static warnOnListenWarnings_(e,t){if(e&&typeof e=="object"&&Q(e,"w")){const s=be(e,"w");if(Array.isArray(s)&&~s.indexOf("no_index")){const i='".indexOn": "'+t._queryParams.getIndex().toString()+'"',r=t._path.toString();W(`Using an unspecified index. Your data will be downloaded and filtered on the client. Consider adding ${i} at ${r} to your security rules for better performance.`)}}}refreshAuthToken(e){this.authToken_=e,this.log_("Auth token refreshed"),this.authToken_?this.tryAuth():this.connected_&&this.sendRequest("unauth",{},()=>{}),this.reduceReconnectDelayIfAdminCredential_(e)}reduceReconnectDelayIfAdminCredential_(e){(e&&e.length===40||Vo(e))&&(this.log_("Admin auth credential detected.  Reducing max reconnect time."),this.maxReconnectDelay_=ai)}refreshAppCheckToken(e){this.appCheckToken_=e,this.log_("App check token refreshed"),this.appCheckToken_?this.tryAppCheck():this.connected_&&this.sendRequest("unappeck",{},()=>{})}tryAuth(){if(this.connected_&&this.authToken_){const e=this.authToken_,t=jo(e)?"auth":"gauth",s={cred:e};this.authOverride_===null?s.noauth=!0:typeof this.authOverride_=="object"&&(s.authvar=this.authOverride_),this.sendRequest(t,s,i=>{const r=i.s,o=i.d||"error";this.authToken_===e&&(r==="ok"?this.invalidAuthTokenCount_=0:this.onAuthRevoked_(r,o))})}}tryAppCheck(){this.connected_&&this.appCheckToken_&&this.sendRequest("appcheck",{token:this.appCheckToken_},e=>{const t=e.s,s=e.d||"error";t==="ok"?this.invalidAppCheckTokenCount_=0:this.onAppCheckRevoked_(t,s)})}unlisten(e,t){const s=e._path.toString(),i=e._queryIdentifier;this.log_("Unlisten called for "+s+" "+i),f(e._queryParams.isDefault()||!e._queryParams.loadsAllData(),"unlisten() called for non-default but complete query"),this.removeListen_(s,i)&&this.connected_&&this.sendUnlisten_(s,i,e._queryObject,t)}sendUnlisten_(e,t,s,i){this.log_("Unlisten on "+e+" for "+t);const r={p:e},o="n";i&&(r.q=s,r.t=i),this.sendRequest(o,r)}onDisconnectPut(e,t,s){this.initConnection_(),this.connected_?this.sendOnDisconnect_("o",e,t,s):this.onDisconnectRequestQueue_.push({pathString:e,action:"o",data:t,onComplete:s})}onDisconnectMerge(e,t,s){this.initConnection_(),this.connected_?this.sendOnDisconnect_("om",e,t,s):this.onDisconnectRequestQueue_.push({pathString:e,action:"om",data:t,onComplete:s})}onDisconnectCancel(e,t){this.initConnection_(),this.connected_?this.sendOnDisconnect_("oc",e,null,t):this.onDisconnectRequestQueue_.push({pathString:e,action:"oc",data:null,onComplete:t})}sendOnDisconnect_(e,t,s,i){const r={p:t,d:s};this.log_("onDisconnect "+e,r),this.sendRequest(e,r,o=>{i&&setTimeout(()=>{i(o.s,o.d)},Math.floor(0))})}put(e,t,s,i){this.putInternal("p",e,t,s,i)}merge(e,t,s,i){this.putInternal("m",e,t,s,i)}putInternal(e,t,s,i,r){this.initConnection_();const o={p:t,d:s};r!==void 0&&(o.h=r),this.outstandingPuts_.push({action:e,request:o,onComplete:i}),this.outstandingPutCount_++;const a=this.outstandingPuts_.length-1;this.connected_?this.sendPut_(a):this.log_("Buffering put: "+t)}sendPut_(e){const t=this.outstandingPuts_[e].action,s=this.outstandingPuts_[e].request,i=this.outstandingPuts_[e].onComplete;this.outstandingPuts_[e].queued=this.connected_,this.sendRequest(t,s,r=>{this.log_(t+" response",r),delete this.outstandingPuts_[e],this.outstandingPutCount_--,this.outstandingPutCount_===0&&(this.outstandingPuts_=[]),i&&i(r.s,r.d)})}reportStats(e){if(this.connected_){const t={c:e};this.log_("reportStats",t),this.sendRequest("s",t,s=>{if(s.s!=="ok"){const r=s.d;this.log_("reportStats","Error sending stats: "+r)}})}}onDataMessage_(e){if("r"in e){this.log_("from server: "+x(e));const t=e.r,s=this.requestCBHash_[t];s&&(delete this.requestCBHash_[t],s(e.b))}else{if("error"in e)throw"A server-side error has occurred: "+e.error;"a"in e&&this.onDataPush_(e.a,e.b)}}onDataPush_(e,t){this.log_("handleServerMessage",e,t),e==="d"?this.onDataUpdate_(t.p,t.d,!1,t.t):e==="m"?this.onDataUpdate_(t.p,t.d,!0,t.t):e==="c"?this.onListenRevoked_(t.p,t.q):e==="ac"?this.onAuthRevoked_(t.s,t.d):e==="apc"?this.onAppCheckRevoked_(t.s,t.d):e==="sd"?this.onSecurityDebugPacket_(t):Mn("Unrecognized action received from server: "+x(e)+`
Are you using the latest client?`)}onReady_(e,t){this.log_("connection ready"),this.connected_=!0,this.lastConnectionEstablishedTime_=new Date().getTime(),this.handleTimestamp_(e),this.lastSessionId=t,this.firstConnection_&&this.sendConnectStats_(),this.restoreState_(),this.firstConnection_=!1,this.onConnectStatus_(!0)}scheduleConnect_(e){f(!this.realtime_,"Scheduling a connect when we're already connected/ing?"),this.establishConnectionTimer_&&clearTimeout(this.establishConnectionTimer_),this.establishConnectionTimer_=setTimeout(()=>{this.establishConnectionTimer_=null,this.establishConnection_()},Math.floor(e))}initConnection_(){!this.realtime_&&this.firstConnection_&&this.scheduleConnect_(0)}onVisible_(e){e&&!this.visible_&&this.reconnectDelay_===this.maxReconnectDelay_&&(this.log_("Window became visible.  Reducing delay."),this.reconnectDelay_=Qe,this.realtime_||this.scheduleConnect_(0)),this.visible_=e}onOnline_(e){e?(this.log_("Browser went online."),this.reconnectDelay_=Qe,this.realtime_||this.scheduleConnect_(0)):(this.log_("Browser went offline.  Killing connection."),this.realtime_&&this.realtime_.close())}onRealtimeDisconnect_(){if(this.log_("data client disconnected"),this.connected_=!1,this.realtime_=null,this.cancelSentTransactions_(),this.requestCBHash_={},this.shouldReconnect_()){this.visible_?this.lastConnectionEstablishedTime_&&(new Date().getTime()-this.lastConnectionEstablishedTime_>tc&&(this.reconnectDelay_=Qe),this.lastConnectionEstablishedTime_=null):(this.log_("Window isn't visible.  Delaying reconnect."),this.reconnectDelay_=this.maxReconnectDelay_,this.lastConnectionAttemptTime_=new Date().getTime());const e=Math.max(0,new Date().getTime()-this.lastConnectionAttemptTime_);let t=Math.max(0,this.reconnectDelay_-e);t=Math.random()*t,this.log_("Trying to reconnect in "+t+"ms"),this.scheduleConnect_(t),this.reconnectDelay_=Math.min(this.maxReconnectDelay_,this.reconnectDelay_*ec)}this.onConnectStatus_(!1)}async establishConnection_(){if(this.shouldReconnect_()){this.log_("Making a connection attempt"),this.lastConnectionAttemptTime_=new Date().getTime(),this.lastConnectionEstablishedTime_=null;const e=this.onDataMessage_.bind(this),t=this.onReady_.bind(this),s=this.onRealtimeDisconnect_.bind(this),i=this.id+":"+ne.nextConnectionId_++,r=this.lastSessionId;let o=!1,a=null;const l=function(){a?a.close():(o=!0,s())},c=function(u){f(a,"sendRequest call when we're not connected not allowed."),a.sendRequest(u)};this.realtime_={close:l,sendRequest:c};const d=this.forceTokenRefresh_;this.forceTokenRefresh_=!1;try{const[u,h]=await Promise.all([this.authTokenProvider_.getToken(d),this.appCheckTokenProvider_.getToken(d)]);o?F("getToken() completed but was canceled"):(F("getToken() completed. Creating connection."),this.authToken_=u&&u.accessToken,this.appCheckToken_=h&&h.token,a=new zl(i,this.repoInfo_,this.applicationId_,this.appCheckToken_,this.authToken_,e,t,s,p=>{W(p+" ("+this.repoInfo_.toString()+")"),this.interrupt(nc)},r))}catch(u){this.log_("Failed to get token: "+u),o||(this.repoInfo_.nodeAdmin&&W(u),l())}}}interrupt(e){F("Interrupting connection for reason: "+e),this.interruptReasons_[e]=!0,this.realtime_?this.realtime_.close():(this.establishConnectionTimer_&&(clearTimeout(this.establishConnectionTimer_),this.establishConnectionTimer_=null),this.connected_&&this.onRealtimeDisconnect_())}resume(e){F("Resuming connection for reason: "+e),delete this.interruptReasons_[e],kn(this.interruptReasons_)&&(this.reconnectDelay_=Qe,this.realtime_||this.scheduleConnect_(0))}handleTimestamp_(e){const t=e-new Date().getTime();this.onServerInfoUpdate_({serverTimeOffset:t})}cancelSentTransactions_(){for(let e=0;e<this.outstandingPuts_.length;e++){const t=this.outstandingPuts_[e];t&&"h"in t.request&&t.queued&&(t.onComplete&&t.onComplete("disconnect"),delete this.outstandingPuts_[e],this.outstandingPutCount_--)}this.outstandingPutCount_===0&&(this.outstandingPuts_=[])}onListenRevoked_(e,t){let s;t?s=t.map(r=>Zn(r)).join("$"):s="default";const i=this.removeListen_(e,s);i&&i.onComplete&&i.onComplete("permission_denied")}removeListen_(e,t){const s=new I(e).toString();let i;if(this.listens.has(s)){const r=this.listens.get(s);i=r.get(t),r.delete(t),r.size===0&&this.listens.delete(s)}else i=void 0;return i}onAuthRevoked_(e,t){F("Auth token revoked: "+e+"/"+t),this.authToken_=null,this.forceTokenRefresh_=!0,this.realtime_.close(),(e==="invalid_token"||e==="permission_denied")&&(this.invalidAuthTokenCount_++,this.invalidAuthTokenCount_>=li&&(this.reconnectDelay_=ai,this.authTokenProvider_.notifyForInvalidToken()))}onAppCheckRevoked_(e,t){F("App check token revoked: "+e+"/"+t),this.appCheckToken_=null,this.forceTokenRefresh_=!0,(e==="invalid_token"||e==="permission_denied")&&(this.invalidAppCheckTokenCount_++,this.invalidAppCheckTokenCount_>=li&&this.appCheckTokenProvider_.notifyForInvalidToken())}onSecurityDebugPacket_(e){this.securityDebugCallback_?this.securityDebugCallback_(e):"msg"in e&&console.log("FIREBASE: "+e.msg.replace(`
`,`
FIREBASE: `))}restoreState_(){this.tryAuth(),this.tryAppCheck();for(const e of this.listens.values())for(const t of e.values())this.sendListen_(t);for(let e=0;e<this.outstandingPuts_.length;e++)this.outstandingPuts_[e]&&this.sendPut_(e);for(;this.onDisconnectRequestQueue_.length;){const e=this.onDisconnectRequestQueue_.shift();this.sendOnDisconnect_(e.action,e.pathString,e.data,e.onComplete)}for(let e=0;e<this.outstandingGets_.length;e++)this.outstandingGets_[e]&&this.sendGet_(e)}sendConnectStats_(){const e={};let t="js";e["sdk."+t+"."+zi.replace(/\./g,"-")]=1,$i()?e["framework.cordova"]=1:Lo()&&(e["framework.reactnative"]=1),this.reportStats(e)}shouldReconnect_(){const e=Ft.getInstance().currentlyOnline();return kn(this.interruptReasons_)&&e}}ne.nextPersistentConnectionId_=0;ne.nextConnectionId_=0;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class b{constructor(e,t){this.name=e,this.node=t}static Wrap(e,t){return new b(e,t)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Zt{getCompare(){return this.compare.bind(this)}indexedValueChanged(e,t){const s=new b($e,e),i=new b($e,t);return this.compare(s,i)!==0}minPost(){return b.MIN}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Tt;class vr extends Zt{static get __EMPTY_NODE(){return Tt}static set __EMPTY_NODE(e){Tt=e}compare(e,t){return Te(e.name,t.name)}isDefinedOn(e){throw Ve("KeyIndex.isDefinedOn not expected to be called.")}indexedValueChanged(e,t){return!1}minPost(){return b.MIN}maxPost(){return new b(Ee,Tt)}makePost(e,t){return f(typeof e=="string","KeyIndex indexValue must always be a string."),new b(e,Tt)}toString(){return".key"}}const Le=new vr;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Rt{constructor(e,t,s,i,r=null){this.isReverse_=i,this.resultGenerator_=r,this.nodeStack_=[];let o=1;for(;!e.isEmpty();)if(e=e,o=t?s(e.key,t):1,i&&(o*=-1),o<0)this.isReverse_?e=e.left:e=e.right;else if(o===0){this.nodeStack_.push(e);break}else this.nodeStack_.push(e),this.isReverse_?e=e.right:e=e.left}getNext(){if(this.nodeStack_.length===0)return null;let e=this.nodeStack_.pop(),t;if(this.resultGenerator_?t=this.resultGenerator_(e.key,e.value):t={key:e.key,value:e.value},this.isReverse_)for(e=e.left;!e.isEmpty();)this.nodeStack_.push(e),e=e.right;else for(e=e.right;!e.isEmpty();)this.nodeStack_.push(e),e=e.left;return t}hasNext(){return this.nodeStack_.length>0}peek(){if(this.nodeStack_.length===0)return null;const e=this.nodeStack_[this.nodeStack_.length-1];return this.resultGenerator_?this.resultGenerator_(e.key,e.value):{key:e.key,value:e.value}}}class L{constructor(e,t,s,i,r){this.key=e,this.value=t,this.color=s??L.RED,this.left=i??U.EMPTY_NODE,this.right=r??U.EMPTY_NODE}copy(e,t,s,i,r){return new L(e??this.key,t??this.value,s??this.color,i??this.left,r??this.right)}count(){return this.left.count()+1+this.right.count()}isEmpty(){return!1}inorderTraversal(e){return this.left.inorderTraversal(e)||!!e(this.key,this.value)||this.right.inorderTraversal(e)}reverseTraversal(e){return this.right.reverseTraversal(e)||e(this.key,this.value)||this.left.reverseTraversal(e)}min_(){return this.left.isEmpty()?this:this.left.min_()}minKey(){return this.min_().key}maxKey(){return this.right.isEmpty()?this.key:this.right.maxKey()}insert(e,t,s){let i=this;const r=s(e,i.key);return r<0?i=i.copy(null,null,null,i.left.insert(e,t,s),null):r===0?i=i.copy(null,t,null,null,null):i=i.copy(null,null,null,null,i.right.insert(e,t,s)),i.fixUp_()}removeMin_(){if(this.left.isEmpty())return U.EMPTY_NODE;let e=this;return!e.left.isRed_()&&!e.left.left.isRed_()&&(e=e.moveRedLeft_()),e=e.copy(null,null,null,e.left.removeMin_(),null),e.fixUp_()}remove(e,t){let s,i;if(s=this,t(e,s.key)<0)!s.left.isEmpty()&&!s.left.isRed_()&&!s.left.left.isRed_()&&(s=s.moveRedLeft_()),s=s.copy(null,null,null,s.left.remove(e,t),null);else{if(s.left.isRed_()&&(s=s.rotateRight_()),!s.right.isEmpty()&&!s.right.isRed_()&&!s.right.left.isRed_()&&(s=s.moveRedRight_()),t(e,s.key)===0){if(s.right.isEmpty())return U.EMPTY_NODE;i=s.right.min_(),s=s.copy(i.key,i.value,null,null,s.right.removeMin_())}s=s.copy(null,null,null,null,s.right.remove(e,t))}return s.fixUp_()}isRed_(){return this.color}fixUp_(){let e=this;return e.right.isRed_()&&!e.left.isRed_()&&(e=e.rotateLeft_()),e.left.isRed_()&&e.left.left.isRed_()&&(e=e.rotateRight_()),e.left.isRed_()&&e.right.isRed_()&&(e=e.colorFlip_()),e}moveRedLeft_(){let e=this.colorFlip_();return e.right.left.isRed_()&&(e=e.copy(null,null,null,null,e.right.rotateRight_()),e=e.rotateLeft_(),e=e.colorFlip_()),e}moveRedRight_(){let e=this.colorFlip_();return e.left.left.isRed_()&&(e=e.rotateRight_(),e=e.colorFlip_()),e}rotateLeft_(){const e=this.copy(null,null,L.RED,null,this.right.left);return this.right.copy(null,null,this.color,e,null)}rotateRight_(){const e=this.copy(null,null,L.RED,this.left.right,null);return this.left.copy(null,null,this.color,null,e)}colorFlip_(){const e=this.left.copy(null,null,!this.left.color,null,null),t=this.right.copy(null,null,!this.right.color,null,null);return this.copy(null,null,!this.color,e,t)}checkMaxDepth_(){const e=this.check_();return Math.pow(2,e)<=this.count()+1}check_(){if(this.isRed_()&&this.left.isRed_())throw new Error("Red node has red child("+this.key+","+this.value+")");if(this.right.isRed_())throw new Error("Right child of ("+this.key+","+this.value+") is red");const e=this.left.check_();if(e!==this.right.check_())throw new Error("Black depths differ");return e+(this.isRed_()?0:1)}}L.RED=!0;L.BLACK=!1;class sc{copy(e,t,s,i,r){return this}insert(e,t,s){return new L(e,t,null)}remove(e,t){return this}count(){return 0}isEmpty(){return!0}inorderTraversal(e){return!1}reverseTraversal(e){return!1}minKey(){return null}maxKey(){return null}check_(){return 0}isRed_(){return!1}}class U{constructor(e,t=U.EMPTY_NODE){this.comparator_=e,this.root_=t}insert(e,t){return new U(this.comparator_,this.root_.insert(e,t,this.comparator_).copy(null,null,L.BLACK,null,null))}remove(e){return new U(this.comparator_,this.root_.remove(e,this.comparator_).copy(null,null,L.BLACK,null,null))}get(e){let t,s=this.root_;for(;!s.isEmpty();){if(t=this.comparator_(e,s.key),t===0)return s.value;t<0?s=s.left:t>0&&(s=s.right)}return null}getPredecessorKey(e){let t,s=this.root_,i=null;for(;!s.isEmpty();)if(t=this.comparator_(e,s.key),t===0){if(s.left.isEmpty())return i?i.key:null;for(s=s.left;!s.right.isEmpty();)s=s.right;return s.key}else t<0?s=s.left:t>0&&(i=s,s=s.right);throw new Error("Attempted to find predecessor key for a nonexistent key.  What gives?")}isEmpty(){return this.root_.isEmpty()}count(){return this.root_.count()}minKey(){return this.root_.minKey()}maxKey(){return this.root_.maxKey()}inorderTraversal(e){return this.root_.inorderTraversal(e)}reverseTraversal(e){return this.root_.reverseTraversal(e)}getIterator(e){return new Rt(this.root_,null,this.comparator_,!1,e)}getIteratorFrom(e,t){return new Rt(this.root_,e,this.comparator_,!1,t)}getReverseIteratorFrom(e,t){return new Rt(this.root_,e,this.comparator_,!0,t)}getReverseIterator(e){return new Rt(this.root_,null,this.comparator_,!0,e)}}U.EMPTY_NODE=new sc;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ic(n,e){return Te(n.name,e.name)}function os(n,e){return Te(n,e)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Fn;function rc(n){Fn=n}const Cr=function(n){return typeof n=="number"?"number:"+Ji(n):"string:"+n},br=function(n){if(n.isLeafNode()){const e=n.val();f(typeof e=="string"||typeof e=="number"||typeof e=="object"&&Q(e,".sv"),"Priority must be a string or number.")}else f(n===Fn||n.isEmpty(),"priority of unexpected type.");f(n===Fn||n.getPriority().isEmpty(),"Priority nodes can't have a priority of their own.")};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let ci;class M{static set __childrenNodeConstructor(e){ci=e}static get __childrenNodeConstructor(){return ci}constructor(e,t=M.__childrenNodeConstructor.EMPTY_NODE){this.value_=e,this.priorityNode_=t,this.lazyHash_=null,f(this.value_!==void 0&&this.value_!==null,"LeafNode shouldn't be created with null/undefined value."),br(this.priorityNode_)}isLeafNode(){return!0}getPriority(){return this.priorityNode_}updatePriority(e){return new M(this.value_,e)}getImmediateChild(e){return e===".priority"?this.priorityNode_:M.__childrenNodeConstructor.EMPTY_NODE}getChild(e){return C(e)?this:v(e)===".priority"?this.priorityNode_:M.__childrenNodeConstructor.EMPTY_NODE}hasChild(){return!1}getPredecessorChildName(e,t){return null}updateImmediateChild(e,t){return e===".priority"?this.updatePriority(t):t.isEmpty()&&e!==".priority"?this:M.__childrenNodeConstructor.EMPTY_NODE.updateImmediateChild(e,t).updatePriority(this.priorityNode_)}updateChild(e,t){const s=v(e);return s===null?t:t.isEmpty()&&s!==".priority"?this:(f(s!==".priority"||he(e)===1,".priority must be the last token in a path"),this.updateImmediateChild(s,M.__childrenNodeConstructor.EMPTY_NODE.updateChild(S(e),t)))}isEmpty(){return!1}numChildren(){return 0}forEachChild(e,t){return!1}val(e){return e&&!this.getPriority().isEmpty()?{".value":this.getValue(),".priority":this.getPriority().val()}:this.getValue()}hash(){if(this.lazyHash_===null){let e="";this.priorityNode_.isEmpty()||(e+="priority:"+Cr(this.priorityNode_.val())+":");const t=typeof this.value_;e+=t+":",t==="number"?e+=Ji(this.value_):e+=this.value_,this.lazyHash_=Qi(e)}return this.lazyHash_}getValue(){return this.value_}compareTo(e){return e===M.__childrenNodeConstructor.EMPTY_NODE?1:e instanceof M.__childrenNodeConstructor?-1:(f(e.isLeafNode(),"Unknown node type"),this.compareToLeafNode_(e))}compareToLeafNode_(e){const t=typeof e.value_,s=typeof this.value_,i=M.VALUE_TYPE_ORDER.indexOf(t),r=M.VALUE_TYPE_ORDER.indexOf(s);return f(i>=0,"Unknown leaf type: "+t),f(r>=0,"Unknown leaf type: "+s),i===r?s==="object"?0:this.value_<e.value_?-1:this.value_===e.value_?0:1:r-i}withIndex(){return this}isIndexed(){return!0}equals(e){if(e===this)return!0;if(e.isLeafNode()){const t=e;return this.value_===t.value_&&this.priorityNode_.equals(t.priorityNode_)}else return!1}}M.VALUE_TYPE_ORDER=["object","boolean","number","string"];/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Er,wr;function oc(n){Er=n}function ac(n){wr=n}class lc extends Zt{compare(e,t){const s=e.node.getPriority(),i=t.node.getPriority(),r=s.compareTo(i);return r===0?Te(e.name,t.name):r}isDefinedOn(e){return!e.getPriority().isEmpty()}indexedValueChanged(e,t){return!e.getPriority().equals(t.getPriority())}minPost(){return b.MIN}maxPost(){return new b(Ee,new M("[PRIORITY-POST]",wr))}makePost(e,t){const s=Er(e);return new b(t,new M("[PRIORITY-POST]",s))}toString(){return".priority"}}const A=new lc;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const cc=Math.log(2);class uc{constructor(e){const t=r=>parseInt(Math.log(r)/cc,10),s=r=>parseInt(Array(r+1).join("1"),2);this.count=t(e+1),this.current_=this.count-1;const i=s(this.count);this.bits_=e+1&i}nextBitIsOne(){const e=!(this.bits_&1<<this.current_);return this.current_--,e}}const $t=function(n,e,t,s){n.sort(e);const i=function(l,c){const d=c-l;let u,h;if(d===0)return null;if(d===1)return u=n[l],h=t?t(u):u,new L(h,u.node,L.BLACK,null,null);{const p=parseInt(d/2,10)+l,_=i(l,p),E=i(p+1,c);return u=n[p],h=t?t(u):u,new L(h,u.node,L.BLACK,_,E)}},r=function(l){let c=null,d=null,u=n.length;const h=function(_,E){const O=u-_,J=u;u-=_;const Z=i(O+1,J),me=n[O],pn=t?t(me):me;p(new L(pn,me.node,E,null,Z))},p=function(_){c?(c.left=_,c=_):(d=_,c=_)};for(let _=0;_<l.count;++_){const E=l.nextBitIsOne(),O=Math.pow(2,l.count-(_+1));E?h(O,L.BLACK):(h(O,L.BLACK),h(O,L.RED))}return d},o=new uc(n.length),a=r(o);return new U(s||e,a)};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let En;const De={};class te{static get Default(){return f(De&&A,"ChildrenNode.ts has not been loaded"),En=En||new te({".priority":De},{".priority":A}),En}constructor(e,t){this.indexes_=e,this.indexSet_=t}get(e){const t=be(this.indexes_,e);if(!t)throw new Error("No index defined for "+e);return t instanceof U?t:null}hasIndex(e){return Q(this.indexSet_,e.toString())}addIndex(e,t){f(e!==Le,"KeyIndex always exists and isn't meant to be added to the IndexMap.");const s=[];let i=!1;const r=t.getIterator(b.Wrap);let o=r.getNext();for(;o;)i=i||e.isDefinedOn(o.node),s.push(o),o=r.getNext();let a;i?a=$t(s,e.getCompare()):a=De;const l=e.toString(),c=Object.assign({},this.indexSet_);c[l]=e;const d=Object.assign({},this.indexes_);return d[l]=a,new te(d,c)}addToIndexes(e,t){const s=Pt(this.indexes_,(i,r)=>{const o=be(this.indexSet_,r);if(f(o,"Missing index implementation for "+r),i===De)if(o.isDefinedOn(e.node)){const a=[],l=t.getIterator(b.Wrap);let c=l.getNext();for(;c;)c.name!==e.name&&a.push(c),c=l.getNext();return a.push(e),$t(a,o.getCompare())}else return De;else{const a=t.get(e.name);let l=i;return a&&(l=l.remove(new b(e.name,a))),l.insert(e,e.node)}});return new te(s,this.indexSet_)}removeFromIndexes(e,t){const s=Pt(this.indexes_,i=>{if(i===De)return i;{const r=t.get(e.name);return r?i.remove(new b(e.name,r)):i}});return new te(s,this.indexSet_)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Xe;class m{static get EMPTY_NODE(){return Xe||(Xe=new m(new U(os),null,te.Default))}constructor(e,t,s){this.children_=e,this.priorityNode_=t,this.indexMap_=s,this.lazyHash_=null,this.priorityNode_&&br(this.priorityNode_),this.children_.isEmpty()&&f(!this.priorityNode_||this.priorityNode_.isEmpty(),"An empty node cannot have a priority")}isLeafNode(){return!1}getPriority(){return this.priorityNode_||Xe}updatePriority(e){return this.children_.isEmpty()?this:new m(this.children_,e,this.indexMap_)}getImmediateChild(e){if(e===".priority")return this.getPriority();{const t=this.children_.get(e);return t===null?Xe:t}}getChild(e){const t=v(e);return t===null?this:this.getImmediateChild(t).getChild(S(e))}hasChild(e){return this.children_.get(e)!==null}updateImmediateChild(e,t){if(f(t,"We should always be passing snapshot nodes"),e===".priority")return this.updatePriority(t);{const s=new b(e,t);let i,r;t.isEmpty()?(i=this.children_.remove(e),r=this.indexMap_.removeFromIndexes(s,this.children_)):(i=this.children_.insert(e,t),r=this.indexMap_.addToIndexes(s,this.children_));const o=i.isEmpty()?Xe:this.priorityNode_;return new m(i,o,r)}}updateChild(e,t){const s=v(e);if(s===null)return t;{f(v(e)!==".priority"||he(e)===1,".priority must be the last token in a path");const i=this.getImmediateChild(s).updateChild(S(e),t);return this.updateImmediateChild(s,i)}}isEmpty(){return this.children_.isEmpty()}numChildren(){return this.children_.count()}val(e){if(this.isEmpty())return null;const t={};let s=0,i=0,r=!0;if(this.forEachChild(A,(o,a)=>{t[o]=a.val(e),s++,r&&m.INTEGER_REGEXP_.test(o)?i=Math.max(i,Number(o)):r=!1}),!e&&r&&i<2*s){const o=[];for(const a in t)o[a]=t[a];return o}else return e&&!this.getPriority().isEmpty()&&(t[".priority"]=this.getPriority().val()),t}hash(){if(this.lazyHash_===null){let e="";this.getPriority().isEmpty()||(e+="priority:"+Cr(this.getPriority().val())+":"),this.forEachChild(A,(t,s)=>{const i=s.hash();i!==""&&(e+=":"+t+":"+i)}),this.lazyHash_=e===""?"":Qi(e)}return this.lazyHash_}getPredecessorChildName(e,t,s){const i=this.resolveIndex_(s);if(i){const r=i.getPredecessorKey(new b(e,t));return r?r.name:null}else return this.children_.getPredecessorKey(e)}getFirstChildName(e){const t=this.resolveIndex_(e);if(t){const s=t.minKey();return s&&s.name}else return this.children_.minKey()}getFirstChild(e){const t=this.getFirstChildName(e);return t?new b(t,this.children_.get(t)):null}getLastChildName(e){const t=this.resolveIndex_(e);if(t){const s=t.maxKey();return s&&s.name}else return this.children_.maxKey()}getLastChild(e){const t=this.getLastChildName(e);return t?new b(t,this.children_.get(t)):null}forEachChild(e,t){const s=this.resolveIndex_(e);return s?s.inorderTraversal(i=>t(i.name,i.node)):this.children_.inorderTraversal(t)}getIterator(e){return this.getIteratorFrom(e.minPost(),e)}getIteratorFrom(e,t){const s=this.resolveIndex_(t);if(s)return s.getIteratorFrom(e,i=>i);{const i=this.children_.getIteratorFrom(e.name,b.Wrap);let r=i.peek();for(;r!=null&&t.compare(r,e)<0;)i.getNext(),r=i.peek();return i}}getReverseIterator(e){return this.getReverseIteratorFrom(e.maxPost(),e)}getReverseIteratorFrom(e,t){const s=this.resolveIndex_(t);if(s)return s.getReverseIteratorFrom(e,i=>i);{const i=this.children_.getReverseIteratorFrom(e.name,b.Wrap);let r=i.peek();for(;r!=null&&t.compare(r,e)>0;)i.getNext(),r=i.peek();return i}}compareTo(e){return this.isEmpty()?e.isEmpty()?0:-1:e.isLeafNode()||e.isEmpty()?1:e===bt?-1:0}withIndex(e){if(e===Le||this.indexMap_.hasIndex(e))return this;{const t=this.indexMap_.addIndex(e,this.children_);return new m(this.children_,this.priorityNode_,t)}}isIndexed(e){return e===Le||this.indexMap_.hasIndex(e)}equals(e){if(e===this)return!0;if(e.isLeafNode())return!1;{const t=e;if(this.getPriority().equals(t.getPriority()))if(this.children_.count()===t.children_.count()){const s=this.getIterator(A),i=t.getIterator(A);let r=s.getNext(),o=i.getNext();for(;r&&o;){if(r.name!==o.name||!r.node.equals(o.node))return!1;r=s.getNext(),o=i.getNext()}return r===null&&o===null}else return!1;else return!1}}resolveIndex_(e){return e===Le?null:this.indexMap_.get(e.toString())}}m.INTEGER_REGEXP_=/^(0|[1-9]\d*)$/;class hc extends m{constructor(){super(new U(os),m.EMPTY_NODE,te.Default)}compareTo(e){return e===this?0:1}equals(e){return e===this}getPriority(){return this}getImmediateChild(e){return m.EMPTY_NODE}isEmpty(){return!1}}const bt=new hc;Object.defineProperties(b,{MIN:{value:new b($e,m.EMPTY_NODE)},MAX:{value:new b(Ee,bt)}});vr.__EMPTY_NODE=m.EMPTY_NODE;M.__childrenNodeConstructor=m;rc(bt);ac(bt);/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const dc=!0;function D(n,e=null){if(n===null)return m.EMPTY_NODE;if(typeof n=="object"&&".priority"in n&&(e=n[".priority"]),f(e===null||typeof e=="string"||typeof e=="number"||typeof e=="object"&&".sv"in e,"Invalid priority type found: "+typeof e),typeof n=="object"&&".value"in n&&n[".value"]!==null&&(n=n[".value"]),typeof n!="object"||".sv"in n){const t=n;return new M(t,D(e))}if(!(n instanceof Array)&&dc){const t=[];let s=!1;if($(n,(o,a)=>{if(o.substring(0,1)!=="."){const l=D(a);l.isEmpty()||(s=s||!l.getPriority().isEmpty(),t.push(new b(o,l)))}}),t.length===0)return m.EMPTY_NODE;const r=$t(t,ic,o=>o.name,os);if(s){const o=$t(t,A.getCompare());return new m(r,D(e),new te({".priority":o},{".priority":A}))}else return new m(r,D(e),te.Default)}else{let t=m.EMPTY_NODE;return $(n,(s,i)=>{if(Q(n,s)&&s.substring(0,1)!=="."){const r=D(i);(r.isLeafNode()||!r.isEmpty())&&(t=t.updateImmediateChild(s,r))}}),t.updatePriority(D(e))}}oc(D);/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class fc extends Zt{constructor(e){super(),this.indexPath_=e,f(!C(e)&&v(e)!==".priority","Can't create PathIndex with empty path or .priority key")}extractChild(e){return e.getChild(this.indexPath_)}isDefinedOn(e){return!e.getChild(this.indexPath_).isEmpty()}compare(e,t){const s=this.extractChild(e.node),i=this.extractChild(t.node),r=s.compareTo(i);return r===0?Te(e.name,t.name):r}makePost(e,t){const s=D(e),i=m.EMPTY_NODE.updateChild(this.indexPath_,s);return new b(t,i)}maxPost(){const e=m.EMPTY_NODE.updateChild(this.indexPath_,bt);return new b(Ee,e)}toString(){return ht(this.indexPath_,0).join("/")}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class pc extends Zt{compare(e,t){const s=e.node.compareTo(t.node);return s===0?Te(e.name,t.name):s}isDefinedOn(e){return!0}indexedValueChanged(e,t){return!e.equals(t)}minPost(){return b.MIN}maxPost(){return b.MAX}makePost(e,t){const s=D(e);return new b(t,s)}toString(){return".value"}}const _c=new pc;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ir(n){return{type:"value",snapshotNode:n}}function Be(n,e){return{type:"child_added",snapshotNode:e,childName:n}}function dt(n,e){return{type:"child_removed",snapshotNode:e,childName:n}}function ft(n,e,t){return{type:"child_changed",snapshotNode:e,childName:n,oldSnap:t}}function mc(n,e){return{type:"child_moved",snapshotNode:e,childName:n}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class as{constructor(e){this.index_=e}updateChild(e,t,s,i,r,o){f(e.isIndexed(this.index_),"A node must be indexed if only a child is updated");const a=e.getImmediateChild(t);return a.getChild(i).equals(s.getChild(i))&&a.isEmpty()===s.isEmpty()||(o!=null&&(s.isEmpty()?e.hasChild(t)?o.trackChildChange(dt(t,a)):f(e.isLeafNode(),"A child remove without an old child only makes sense on a leaf node"):a.isEmpty()?o.trackChildChange(Be(t,s)):o.trackChildChange(ft(t,s,a))),e.isLeafNode()&&s.isEmpty())?e:e.updateImmediateChild(t,s).withIndex(this.index_)}updateFullNode(e,t,s){return s!=null&&(e.isLeafNode()||e.forEachChild(A,(i,r)=>{t.hasChild(i)||s.trackChildChange(dt(i,r))}),t.isLeafNode()||t.forEachChild(A,(i,r)=>{if(e.hasChild(i)){const o=e.getImmediateChild(i);o.equals(r)||s.trackChildChange(ft(i,r,o))}else s.trackChildChange(Be(i,r))})),t.withIndex(this.index_)}updatePriority(e,t){return e.isEmpty()?m.EMPTY_NODE:e.updatePriority(t)}filtersNodes(){return!1}getIndexedFilter(){return this}getIndex(){return this.index_}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class pt{constructor(e){this.indexedFilter_=new as(e.getIndex()),this.index_=e.getIndex(),this.startPost_=pt.getStartPost_(e),this.endPost_=pt.getEndPost_(e),this.startIsInclusive_=!e.startAfterSet_,this.endIsInclusive_=!e.endBeforeSet_}getStartPost(){return this.startPost_}getEndPost(){return this.endPost_}matches(e){const t=this.startIsInclusive_?this.index_.compare(this.getStartPost(),e)<=0:this.index_.compare(this.getStartPost(),e)<0,s=this.endIsInclusive_?this.index_.compare(e,this.getEndPost())<=0:this.index_.compare(e,this.getEndPost())<0;return t&&s}updateChild(e,t,s,i,r,o){return this.matches(new b(t,s))||(s=m.EMPTY_NODE),this.indexedFilter_.updateChild(e,t,s,i,r,o)}updateFullNode(e,t,s){t.isLeafNode()&&(t=m.EMPTY_NODE);let i=t.withIndex(this.index_);i=i.updatePriority(m.EMPTY_NODE);const r=this;return t.forEachChild(A,(o,a)=>{r.matches(new b(o,a))||(i=i.updateImmediateChild(o,m.EMPTY_NODE))}),this.indexedFilter_.updateFullNode(e,i,s)}updatePriority(e,t){return e}filtersNodes(){return!0}getIndexedFilter(){return this.indexedFilter_}getIndex(){return this.index_}static getStartPost_(e){if(e.hasStart()){const t=e.getIndexStartName();return e.getIndex().makePost(e.getIndexStartValue(),t)}else return e.getIndex().minPost()}static getEndPost_(e){if(e.hasEnd()){const t=e.getIndexEndName();return e.getIndex().makePost(e.getIndexEndValue(),t)}else return e.getIndex().maxPost()}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class gc{constructor(e){this.withinDirectionalStart=t=>this.reverse_?this.withinEndPost(t):this.withinStartPost(t),this.withinDirectionalEnd=t=>this.reverse_?this.withinStartPost(t):this.withinEndPost(t),this.withinStartPost=t=>{const s=this.index_.compare(this.rangedFilter_.getStartPost(),t);return this.startIsInclusive_?s<=0:s<0},this.withinEndPost=t=>{const s=this.index_.compare(t,this.rangedFilter_.getEndPost());return this.endIsInclusive_?s<=0:s<0},this.rangedFilter_=new pt(e),this.index_=e.getIndex(),this.limit_=e.getLimit(),this.reverse_=!e.isViewFromLeft(),this.startIsInclusive_=!e.startAfterSet_,this.endIsInclusive_=!e.endBeforeSet_}updateChild(e,t,s,i,r,o){return this.rangedFilter_.matches(new b(t,s))||(s=m.EMPTY_NODE),e.getImmediateChild(t).equals(s)?e:e.numChildren()<this.limit_?this.rangedFilter_.getIndexedFilter().updateChild(e,t,s,i,r,o):this.fullLimitUpdateChild_(e,t,s,r,o)}updateFullNode(e,t,s){let i;if(t.isLeafNode()||t.isEmpty())i=m.EMPTY_NODE.withIndex(this.index_);else if(this.limit_*2<t.numChildren()&&t.isIndexed(this.index_)){i=m.EMPTY_NODE.withIndex(this.index_);let r;this.reverse_?r=t.getReverseIteratorFrom(this.rangedFilter_.getEndPost(),this.index_):r=t.getIteratorFrom(this.rangedFilter_.getStartPost(),this.index_);let o=0;for(;r.hasNext()&&o<this.limit_;){const a=r.getNext();if(this.withinDirectionalStart(a))if(this.withinDirectionalEnd(a))i=i.updateImmediateChild(a.name,a.node),o++;else break;else continue}}else{i=t.withIndex(this.index_),i=i.updatePriority(m.EMPTY_NODE);let r;this.reverse_?r=i.getReverseIterator(this.index_):r=i.getIterator(this.index_);let o=0;for(;r.hasNext();){const a=r.getNext();o<this.limit_&&this.withinDirectionalStart(a)&&this.withinDirectionalEnd(a)?o++:i=i.updateImmediateChild(a.name,m.EMPTY_NODE)}}return this.rangedFilter_.getIndexedFilter().updateFullNode(e,i,s)}updatePriority(e,t){return e}filtersNodes(){return!0}getIndexedFilter(){return this.rangedFilter_.getIndexedFilter()}getIndex(){return this.index_}fullLimitUpdateChild_(e,t,s,i,r){let o;if(this.reverse_){const u=this.index_.getCompare();o=(h,p)=>u(p,h)}else o=this.index_.getCompare();const a=e;f(a.numChildren()===this.limit_,"");const l=new b(t,s),c=this.reverse_?a.getFirstChild(this.index_):a.getLastChild(this.index_),d=this.rangedFilter_.matches(l);if(a.hasChild(t)){const u=a.getImmediateChild(t);let h=i.getChildAfterChild(this.index_,c,this.reverse_);for(;h!=null&&(h.name===t||a.hasChild(h.name));)h=i.getChildAfterChild(this.index_,h,this.reverse_);const p=h==null?1:o(h,l);if(d&&!s.isEmpty()&&p>=0)return r!=null&&r.trackChildChange(ft(t,s,u)),a.updateImmediateChild(t,s);{r!=null&&r.trackChildChange(dt(t,u));const E=a.updateImmediateChild(t,m.EMPTY_NODE);return h!=null&&this.rangedFilter_.matches(h)?(r!=null&&r.trackChildChange(Be(h.name,h.node)),E.updateImmediateChild(h.name,h.node)):E}}else return s.isEmpty()?e:d&&o(c,l)>=0?(r!=null&&(r.trackChildChange(dt(c.name,c.node)),r.trackChildChange(Be(t,s))),a.updateImmediateChild(t,s).updateImmediateChild(c.name,m.EMPTY_NODE)):e}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ls{constructor(){this.limitSet_=!1,this.startSet_=!1,this.startNameSet_=!1,this.startAfterSet_=!1,this.endSet_=!1,this.endNameSet_=!1,this.endBeforeSet_=!1,this.limit_=0,this.viewFrom_="",this.indexStartValue_=null,this.indexStartName_="",this.indexEndValue_=null,this.indexEndName_="",this.index_=A}hasStart(){return this.startSet_}isViewFromLeft(){return this.viewFrom_===""?this.startSet_:this.viewFrom_==="l"}getIndexStartValue(){return f(this.startSet_,"Only valid if start has been set"),this.indexStartValue_}getIndexStartName(){return f(this.startSet_,"Only valid if start has been set"),this.startNameSet_?this.indexStartName_:$e}hasEnd(){return this.endSet_}getIndexEndValue(){return f(this.endSet_,"Only valid if end has been set"),this.indexEndValue_}getIndexEndName(){return f(this.endSet_,"Only valid if end has been set"),this.endNameSet_?this.indexEndName_:Ee}hasLimit(){return this.limitSet_}hasAnchoredLimit(){return this.limitSet_&&this.viewFrom_!==""}getLimit(){return f(this.limitSet_,"Only valid if limit has been set"),this.limit_}getIndex(){return this.index_}loadsAllData(){return!(this.startSet_||this.endSet_||this.limitSet_)}isDefault(){return this.loadsAllData()&&this.index_===A}copy(){const e=new ls;return e.limitSet_=this.limitSet_,e.limit_=this.limit_,e.startSet_=this.startSet_,e.startAfterSet_=this.startAfterSet_,e.indexStartValue_=this.indexStartValue_,e.startNameSet_=this.startNameSet_,e.indexStartName_=this.indexStartName_,e.endSet_=this.endSet_,e.endBeforeSet_=this.endBeforeSet_,e.indexEndValue_=this.indexEndValue_,e.endNameSet_=this.endNameSet_,e.indexEndName_=this.indexEndName_,e.index_=this.index_,e.viewFrom_=this.viewFrom_,e}}function yc(n){return n.loadsAllData()?new as(n.getIndex()):n.hasLimit()?new gc(n):new pt(n)}function ui(n){const e={};if(n.isDefault())return e;let t;if(n.index_===A?t="$priority":n.index_===_c?t="$value":n.index_===Le?t="$key":(f(n.index_ instanceof fc,"Unrecognized index type!"),t=n.index_.toString()),e.orderBy=x(t),n.startSet_){const s=n.startAfterSet_?"startAfter":"startAt";e[s]=x(n.indexStartValue_),n.startNameSet_&&(e[s]+=","+x(n.indexStartName_))}if(n.endSet_){const s=n.endBeforeSet_?"endBefore":"endAt";e[s]=x(n.indexEndValue_),n.endNameSet_&&(e[s]+=","+x(n.indexEndName_))}return n.limitSet_&&(n.isViewFromLeft()?e.limitToFirst=n.limit_:e.limitToLast=n.limit_),e}function hi(n){const e={};if(n.startSet_&&(e.sp=n.indexStartValue_,n.startNameSet_&&(e.sn=n.indexStartName_),e.sin=!n.startAfterSet_),n.endSet_&&(e.ep=n.indexEndValue_,n.endNameSet_&&(e.en=n.indexEndName_),e.ein=!n.endBeforeSet_),n.limitSet_){e.l=n.limit_;let t=n.viewFrom_;t===""&&(n.isViewFromLeft()?t="l":t="r"),e.vf=t}return n.index_!==A&&(e.i=n.index_.toString()),e}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Bt extends _r{reportStats(e){throw new Error("Method not implemented.")}static getListenId_(e,t){return t!==void 0?"tag$"+t:(f(e._queryParams.isDefault(),"should have a tag if it's not a default query."),e._path.toString())}constructor(e,t,s,i){super(),this.repoInfo_=e,this.onDataUpdate_=t,this.authTokenProvider_=s,this.appCheckTokenProvider_=i,this.log_=Ct("p:rest:"),this.listens_={}}listen(e,t,s,i){const r=e._path.toString();this.log_("Listen called for "+r+" "+e._queryIdentifier);const o=Bt.getListenId_(e,s),a={};this.listens_[o]=a;const l=ui(e._queryParams);this.restRequest_(r+".json",l,(c,d)=>{let u=d;if(c===404&&(u=null,c=null),c===null&&this.onDataUpdate_(r,u,!1,s),be(this.listens_,o)===a){let h;c?c===401?h="permission_denied":h="rest_error:"+c:h="ok",i(h,null)}})}unlisten(e,t){const s=Bt.getListenId_(e,t);delete this.listens_[s]}get(e){const t=ui(e._queryParams),s=e._path.toString(),i=new G;return this.restRequest_(s+".json",t,(r,o)=>{let a=o;r===404&&(a=null,r=null),r===null?(this.onDataUpdate_(s,a,!1,null),i.resolve(a)):i.reject(new Error(a))}),i.promise}refreshAuthToken(e){}restRequest_(e,t={},s){return t.format="export",Promise.all([this.authTokenProvider_.getToken(!1),this.appCheckTokenProvider_.getToken(!1)]).then(([i,r])=>{i&&i.accessToken&&(t.auth=i.accessToken),r&&r.token&&(t.ac=r.token);const o=(this.repoInfo_.secure?"https://":"http://")+this.repoInfo_.host+e+"?ns="+this.repoInfo_.namespace+Go(t);this.log_("Sending REST request for "+o);const a=new XMLHttpRequest;a.onreadystatechange=()=>{if(s&&a.readyState===4){this.log_("REST Response for "+o+" received. status:",a.status,"response:",a.responseText);let l=null;if(a.status>=200&&a.status<300){try{l=at(a.responseText)}catch{W("Failed to parse JSON response for "+o+": "+a.responseText)}s(null,l)}else a.status!==401&&a.status!==404&&W("Got unsuccessful REST response for "+o+" Status: "+a.status),s(a.status);s=null}},a.open("GET",o,!0),a.send()})}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class vc{constructor(){this.rootNode_=m.EMPTY_NODE}getNode(e){return this.rootNode_.getChild(e)}updateSnapshot(e,t){this.rootNode_=this.rootNode_.updateChild(e,t)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Wt(){return{value:null,children:new Map}}function qe(n,e,t){if(C(e))n.value=t,n.children.clear();else if(n.value!==null)n.value=n.value.updateChild(e,t);else{const s=v(e);n.children.has(s)||n.children.set(s,Wt());const i=n.children.get(s);e=S(e),qe(i,e,t)}}function $n(n,e){if(C(e))return n.value=null,n.children.clear(),!0;if(n.value!==null){if(n.value.isLeafNode())return!1;{const t=n.value;return n.value=null,t.forEachChild(A,(s,i)=>{qe(n,new I(s),i)}),$n(n,e)}}else if(n.children.size>0){const t=v(e);return e=S(e),n.children.has(t)&&$n(n.children.get(t),e)&&n.children.delete(t),n.children.size===0}else return!0}function Bn(n,e,t){n.value!==null?t(e,n.value):Cc(n,(s,i)=>{const r=new I(e.toString()+"/"+s);Bn(i,r,t)})}function Cc(n,e){n.children.forEach((t,s)=>{e(s,t)})}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class bc{constructor(e){this.collection_=e,this.last_=null}get(){const e=this.collection_.get(),t=Object.assign({},e);return this.last_&&$(this.last_,(s,i)=>{t[s]=t[s]-i}),this.last_=e,t}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const di=10*1e3,Ec=30*1e3,wc=300*1e3;class Ic{constructor(e,t){this.server_=t,this.statsToReport_={},this.statsListener_=new bc(e);const s=di+(Ec-di)*Math.random();nt(this.reportStats_.bind(this),Math.floor(s))}reportStats_(){const e=this.statsListener_.get(),t={};let s=!1;$(e,(i,r)=>{r>0&&Q(this.statsToReport_,i)&&(t[i]=r,s=!0)}),s&&this.server_.reportStats(t),nt(this.reportStats_.bind(this),Math.floor(Math.random()*2*wc))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var z;(function(n){n[n.OVERWRITE=0]="OVERWRITE",n[n.MERGE=1]="MERGE",n[n.ACK_USER_WRITE=2]="ACK_USER_WRITE",n[n.LISTEN_COMPLETE=3]="LISTEN_COMPLETE"})(z||(z={}));function cs(){return{fromUser:!0,fromServer:!1,queryId:null,tagged:!1}}function us(){return{fromUser:!1,fromServer:!0,queryId:null,tagged:!1}}function hs(n){return{fromUser:!1,fromServer:!0,queryId:n,tagged:!0}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ut{constructor(e,t,s){this.path=e,this.affectedTree=t,this.revert=s,this.type=z.ACK_USER_WRITE,this.source=cs()}operationForChild(e){if(C(this.path)){if(this.affectedTree.value!=null)return f(this.affectedTree.children.isEmpty(),"affectedTree should not have overlapping affected paths."),this;{const t=this.affectedTree.subtree(new I(e));return new Ut(w(),t,this.revert)}}else return f(v(this.path)===e,"operationForChild called for unrelated child."),new Ut(S(this.path),this.affectedTree,this.revert)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class _t{constructor(e,t){this.source=e,this.path=t,this.type=z.LISTEN_COMPLETE}operationForChild(e){return C(this.path)?new _t(this.source,w()):new _t(this.source,S(this.path))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class we{constructor(e,t,s){this.source=e,this.path=t,this.snap=s,this.type=z.OVERWRITE}operationForChild(e){return C(this.path)?new we(this.source,w(),this.snap.getImmediateChild(e)):new we(this.source,S(this.path),this.snap)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class We{constructor(e,t,s){this.source=e,this.path=t,this.children=s,this.type=z.MERGE}operationForChild(e){if(C(this.path)){const t=this.children.subtree(new I(e));return t.isEmpty()?null:t.value?new we(this.source,w(),t.value):new We(this.source,w(),t)}else return f(v(this.path)===e,"Can't get a merge for a child not on the path of the operation"),new We(this.source,S(this.path),this.children)}toString(){return"Operation("+this.path+": "+this.source.toString()+" merge: "+this.children.toString()+")"}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class de{constructor(e,t,s){this.node_=e,this.fullyInitialized_=t,this.filtered_=s}isFullyInitialized(){return this.fullyInitialized_}isFiltered(){return this.filtered_}isCompleteForPath(e){if(C(e))return this.isFullyInitialized()&&!this.filtered_;const t=v(e);return this.isCompleteForChild(t)}isCompleteForChild(e){return this.isFullyInitialized()&&!this.filtered_||this.node_.hasChild(e)}getNode(){return this.node_}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Sc{constructor(e){this.query_=e,this.index_=this.query_._queryParams.getIndex()}}function Tc(n,e,t,s){const i=[],r=[];return e.forEach(o=>{o.type==="child_changed"&&n.index_.indexedValueChanged(o.oldSnap,o.snapshotNode)&&r.push(mc(o.childName,o.snapshotNode))}),Je(n,i,"child_removed",e,s,t),Je(n,i,"child_added",e,s,t),Je(n,i,"child_moved",r,s,t),Je(n,i,"child_changed",e,s,t),Je(n,i,"value",e,s,t),i}function Je(n,e,t,s,i,r){const o=s.filter(a=>a.type===t);o.sort((a,l)=>Nc(n,a,l)),o.forEach(a=>{const l=Rc(n,a,r);i.forEach(c=>{c.respondsTo(a.type)&&e.push(c.createEvent(l,n.query_))})})}function Rc(n,e,t){return e.type==="value"||e.type==="child_removed"||(e.prevName=t.getPredecessorChildName(e.childName,e.snapshotNode,n.index_)),e}function Nc(n,e,t){if(e.childName==null||t.childName==null)throw Ve("Should only compare child_ events.");const s=new b(e.childName,e.snapshotNode),i=new b(t.childName,t.snapshotNode);return n.index_.compare(s,i)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function en(n,e){return{eventCache:n,serverCache:e}}function st(n,e,t,s){return en(new de(e,t,s),n.serverCache)}function Sr(n,e,t,s){return en(n.eventCache,new de(e,t,s))}function Ht(n){return n.eventCache.isFullyInitialized()?n.eventCache.getNode():null}function Ie(n){return n.serverCache.isFullyInitialized()?n.serverCache.getNode():null}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let wn;const kc=()=>(wn||(wn=new U(fl)),wn);class N{static fromObject(e){let t=new N(null);return $(e,(s,i)=>{t=t.set(new I(s),i)}),t}constructor(e,t=kc()){this.value=e,this.children=t}isEmpty(){return this.value===null&&this.children.isEmpty()}findRootMostMatchingPathAndValue(e,t){if(this.value!=null&&t(this.value))return{path:w(),value:this.value};if(C(e))return null;{const s=v(e),i=this.children.get(s);if(i!==null){const r=i.findRootMostMatchingPathAndValue(S(e),t);return r!=null?{path:P(new I(s),r.path),value:r.value}:null}else return null}}findRootMostValueAndPath(e){return this.findRootMostMatchingPathAndValue(e,()=>!0)}subtree(e){if(C(e))return this;{const t=v(e),s=this.children.get(t);return s!==null?s.subtree(S(e)):new N(null)}}set(e,t){if(C(e))return new N(t,this.children);{const s=v(e),r=(this.children.get(s)||new N(null)).set(S(e),t),o=this.children.insert(s,r);return new N(this.value,o)}}remove(e){if(C(e))return this.children.isEmpty()?new N(null):new N(null,this.children);{const t=v(e),s=this.children.get(t);if(s){const i=s.remove(S(e));let r;return i.isEmpty()?r=this.children.remove(t):r=this.children.insert(t,i),this.value===null&&r.isEmpty()?new N(null):new N(this.value,r)}else return this}}get(e){if(C(e))return this.value;{const t=v(e),s=this.children.get(t);return s?s.get(S(e)):null}}setTree(e,t){if(C(e))return t;{const s=v(e),r=(this.children.get(s)||new N(null)).setTree(S(e),t);let o;return r.isEmpty()?o=this.children.remove(s):o=this.children.insert(s,r),new N(this.value,o)}}fold(e){return this.fold_(w(),e)}fold_(e,t){const s={};return this.children.inorderTraversal((i,r)=>{s[i]=r.fold_(P(e,i),t)}),t(e,this.value,s)}findOnPath(e,t){return this.findOnPath_(e,w(),t)}findOnPath_(e,t,s){const i=this.value?s(t,this.value):!1;if(i)return i;if(C(e))return null;{const r=v(e),o=this.children.get(r);return o?o.findOnPath_(S(e),P(t,r),s):null}}foreachOnPath(e,t){return this.foreachOnPath_(e,w(),t)}foreachOnPath_(e,t,s){if(C(e))return this;{this.value&&s(t,this.value);const i=v(e),r=this.children.get(i);return r?r.foreachOnPath_(S(e),P(t,i),s):new N(null)}}foreach(e){this.foreach_(w(),e)}foreach_(e,t){this.children.inorderTraversal((s,i)=>{i.foreach_(P(e,s),t)}),this.value&&t(e,this.value)}foreachChild(e){this.children.inorderTraversal((t,s)=>{s.value&&e(t,s.value)})}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Y{constructor(e){this.writeTree_=e}static empty(){return new Y(new N(null))}}function it(n,e,t){if(C(e))return new Y(new N(t));{const s=n.writeTree_.findRootMostValueAndPath(e);if(s!=null){const i=s.path;let r=s.value;const o=B(i,e);return r=r.updateChild(o,t),new Y(n.writeTree_.set(i,r))}else{const i=new N(t),r=n.writeTree_.setTree(e,i);return new Y(r)}}}function Wn(n,e,t){let s=n;return $(t,(i,r)=>{s=it(s,P(e,i),r)}),s}function fi(n,e){if(C(e))return Y.empty();{const t=n.writeTree_.setTree(e,new N(null));return new Y(t)}}function Un(n,e){return Re(n,e)!=null}function Re(n,e){const t=n.writeTree_.findRootMostValueAndPath(e);return t!=null?n.writeTree_.get(t.path).getChild(B(t.path,e)):null}function pi(n){const e=[],t=n.writeTree_.value;return t!=null?t.isLeafNode()||t.forEachChild(A,(s,i)=>{e.push(new b(s,i))}):n.writeTree_.children.inorderTraversal((s,i)=>{i.value!=null&&e.push(new b(s,i.value))}),e}function ce(n,e){if(C(e))return n;{const t=Re(n,e);return t!=null?new Y(new N(t)):new Y(n.writeTree_.subtree(e))}}function Hn(n){return n.writeTree_.isEmpty()}function Ue(n,e){return Tr(w(),n.writeTree_,e)}function Tr(n,e,t){if(e.value!=null)return t.updateChild(n,e.value);{let s=null;return e.children.inorderTraversal((i,r)=>{i===".priority"?(f(r.value!==null,"Priority writes must always be leaf nodes"),s=r.value):t=Tr(P(n,i),r,t)}),!t.getChild(n).isEmpty()&&s!==null&&(t=t.updateChild(P(n,".priority"),s)),t}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function tn(n,e){return Ar(e,n)}function Ac(n,e,t,s,i){f(s>n.lastWriteId,"Stacking an older write on top of newer ones"),i===void 0&&(i=!0),n.allWrites.push({path:e,snap:t,writeId:s,visible:i}),i&&(n.visibleWrites=it(n.visibleWrites,e,t)),n.lastWriteId=s}function Dc(n,e,t,s){f(s>n.lastWriteId,"Stacking an older merge on top of newer ones"),n.allWrites.push({path:e,children:t,writeId:s,visible:!0}),n.visibleWrites=Wn(n.visibleWrites,e,t),n.lastWriteId=s}function Pc(n,e){for(let t=0;t<n.allWrites.length;t++){const s=n.allWrites[t];if(s.writeId===e)return s}return null}function Oc(n,e){const t=n.allWrites.findIndex(a=>a.writeId===e);f(t>=0,"removeWrite called with nonexistent writeId.");const s=n.allWrites[t];n.allWrites.splice(t,1);let i=s.visible,r=!1,o=n.allWrites.length-1;for(;i&&o>=0;){const a=n.allWrites[o];a.visible&&(o>=t&&xc(a,s.path)?i=!1:V(s.path,a.path)&&(r=!0)),o--}if(i){if(r)return Mc(n),!0;if(s.snap)n.visibleWrites=fi(n.visibleWrites,s.path);else{const a=s.children;$(a,l=>{n.visibleWrites=fi(n.visibleWrites,P(s.path,l))})}return!0}else return!1}function xc(n,e){if(n.snap)return V(n.path,e);for(const t in n.children)if(n.children.hasOwnProperty(t)&&V(P(n.path,t),e))return!0;return!1}function Mc(n){n.visibleWrites=Rr(n.allWrites,Lc,w()),n.allWrites.length>0?n.lastWriteId=n.allWrites[n.allWrites.length-1].writeId:n.lastWriteId=-1}function Lc(n){return n.visible}function Rr(n,e,t){let s=Y.empty();for(let i=0;i<n.length;++i){const r=n[i];if(e(r)){const o=r.path;let a;if(r.snap)V(t,o)?(a=B(t,o),s=it(s,a,r.snap)):V(o,t)&&(a=B(o,t),s=it(s,w(),r.snap.getChild(a)));else if(r.children){if(V(t,o))a=B(t,o),s=Wn(s,a,r.children);else if(V(o,t))if(a=B(o,t),C(a))s=Wn(s,w(),r.children);else{const l=be(r.children,v(a));if(l){const c=l.getChild(S(a));s=it(s,w(),c)}}}else throw Ve("WriteRecord should have .snap or .children")}}return s}function Nr(n,e,t,s,i){if(!s&&!i){const r=Re(n.visibleWrites,e);if(r!=null)return r;{const o=ce(n.visibleWrites,e);if(Hn(o))return t;if(t==null&&!Un(o,w()))return null;{const a=t||m.EMPTY_NODE;return Ue(o,a)}}}else{const r=ce(n.visibleWrites,e);if(!i&&Hn(r))return t;if(!i&&t==null&&!Un(r,w()))return null;{const o=function(c){return(c.visible||i)&&(!s||!~s.indexOf(c.writeId))&&(V(c.path,e)||V(e,c.path))},a=Rr(n.allWrites,o,e),l=t||m.EMPTY_NODE;return Ue(a,l)}}}function Fc(n,e,t){let s=m.EMPTY_NODE;const i=Re(n.visibleWrites,e);if(i)return i.isLeafNode()||i.forEachChild(A,(r,o)=>{s=s.updateImmediateChild(r,o)}),s;if(t){const r=ce(n.visibleWrites,e);return t.forEachChild(A,(o,a)=>{const l=Ue(ce(r,new I(o)),a);s=s.updateImmediateChild(o,l)}),pi(r).forEach(o=>{s=s.updateImmediateChild(o.name,o.node)}),s}else{const r=ce(n.visibleWrites,e);return pi(r).forEach(o=>{s=s.updateImmediateChild(o.name,o.node)}),s}}function $c(n,e,t,s,i){f(s||i,"Either existingEventSnap or existingServerSnap must exist");const r=P(e,t);if(Un(n.visibleWrites,r))return null;{const o=ce(n.visibleWrites,r);return Hn(o)?i.getChild(t):Ue(o,i.getChild(t))}}function Bc(n,e,t,s){const i=P(e,t),r=Re(n.visibleWrites,i);if(r!=null)return r;if(s.isCompleteForChild(t)){const o=ce(n.visibleWrites,i);return Ue(o,s.getNode().getImmediateChild(t))}else return null}function Wc(n,e){return Re(n.visibleWrites,e)}function Uc(n,e,t,s,i,r,o){let a;const l=ce(n.visibleWrites,e),c=Re(l,w());if(c!=null)a=c;else if(t!=null)a=Ue(l,t);else return[];if(a=a.withIndex(o),!a.isEmpty()&&!a.isLeafNode()){const d=[],u=o.getCompare(),h=r?a.getReverseIteratorFrom(s,o):a.getIteratorFrom(s,o);let p=h.getNext();for(;p&&d.length<i;)u(p,s)!==0&&d.push(p),p=h.getNext();return d}else return[]}function Hc(){return{visibleWrites:Y.empty(),allWrites:[],lastWriteId:-1}}function jt(n,e,t,s){return Nr(n.writeTree,n.treePath,e,t,s)}function ds(n,e){return Fc(n.writeTree,n.treePath,e)}function _i(n,e,t,s){return $c(n.writeTree,n.treePath,e,t,s)}function Vt(n,e){return Wc(n.writeTree,P(n.treePath,e))}function jc(n,e,t,s,i,r){return Uc(n.writeTree,n.treePath,e,t,s,i,r)}function fs(n,e,t){return Bc(n.writeTree,n.treePath,e,t)}function kr(n,e){return Ar(P(n.treePath,e),n.writeTree)}function Ar(n,e){return{treePath:n,writeTree:e}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Vc{constructor(){this.changeMap=new Map}trackChildChange(e){const t=e.type,s=e.childName;f(t==="child_added"||t==="child_changed"||t==="child_removed","Only child changes supported for tracking"),f(s!==".priority","Only non-priority child changes can be tracked.");const i=this.changeMap.get(s);if(i){const r=i.type;if(t==="child_added"&&r==="child_removed")this.changeMap.set(s,ft(s,e.snapshotNode,i.snapshotNode));else if(t==="child_removed"&&r==="child_added")this.changeMap.delete(s);else if(t==="child_removed"&&r==="child_changed")this.changeMap.set(s,dt(s,i.oldSnap));else if(t==="child_changed"&&r==="child_added")this.changeMap.set(s,Be(s,e.snapshotNode));else if(t==="child_changed"&&r==="child_changed")this.changeMap.set(s,ft(s,e.snapshotNode,i.oldSnap));else throw Ve("Illegal combination of changes: "+e+" occurred after "+i)}else this.changeMap.set(s,e)}getChanges(){return Array.from(this.changeMap.values())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Gc{getCompleteChild(e){return null}getChildAfterChild(e,t,s){return null}}const Dr=new Gc;class ps{constructor(e,t,s=null){this.writes_=e,this.viewCache_=t,this.optCompleteServerCache_=s}getCompleteChild(e){const t=this.viewCache_.eventCache;if(t.isCompleteForChild(e))return t.getNode().getImmediateChild(e);{const s=this.optCompleteServerCache_!=null?new de(this.optCompleteServerCache_,!0,!1):this.viewCache_.serverCache;return fs(this.writes_,e,s)}}getChildAfterChild(e,t,s){const i=this.optCompleteServerCache_!=null?this.optCompleteServerCache_:Ie(this.viewCache_),r=jc(this.writes_,i,t,1,s,e);return r.length===0?null:r[0]}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function qc(n){return{filter:n}}function zc(n,e){f(e.eventCache.getNode().isIndexed(n.filter.getIndex()),"Event snap not indexed"),f(e.serverCache.getNode().isIndexed(n.filter.getIndex()),"Server snap not indexed")}function Yc(n,e,t,s,i){const r=new Vc;let o,a;if(t.type===z.OVERWRITE){const c=t;c.source.fromUser?o=jn(n,e,c.path,c.snap,s,i,r):(f(c.source.fromServer,"Unknown source."),a=c.source.tagged||e.serverCache.isFiltered()&&!C(c.path),o=Gt(n,e,c.path,c.snap,s,i,a,r))}else if(t.type===z.MERGE){const c=t;c.source.fromUser?o=Qc(n,e,c.path,c.children,s,i,r):(f(c.source.fromServer,"Unknown source."),a=c.source.tagged||e.serverCache.isFiltered(),o=Vn(n,e,c.path,c.children,s,i,a,r))}else if(t.type===z.ACK_USER_WRITE){const c=t;c.revert?o=Zc(n,e,c.path,s,i,r):o=Xc(n,e,c.path,c.affectedTree,s,i,r)}else if(t.type===z.LISTEN_COMPLETE)o=Jc(n,e,t.path,s,r);else throw Ve("Unknown operation type: "+t.type);const l=r.getChanges();return Kc(e,o,l),{viewCache:o,changes:l}}function Kc(n,e,t){const s=e.eventCache;if(s.isFullyInitialized()){const i=s.getNode().isLeafNode()||s.getNode().isEmpty(),r=Ht(n);(t.length>0||!n.eventCache.isFullyInitialized()||i&&!s.getNode().equals(r)||!s.getNode().getPriority().equals(r.getPriority()))&&t.push(Ir(Ht(e)))}}function Pr(n,e,t,s,i,r){const o=e.eventCache;if(Vt(s,t)!=null)return e;{let a,l;if(C(t))if(f(e.serverCache.isFullyInitialized(),"If change path is empty, we must have complete server data"),e.serverCache.isFiltered()){const c=Ie(e),d=c instanceof m?c:m.EMPTY_NODE,u=ds(s,d);a=n.filter.updateFullNode(e.eventCache.getNode(),u,r)}else{const c=jt(s,Ie(e));a=n.filter.updateFullNode(e.eventCache.getNode(),c,r)}else{const c=v(t);if(c===".priority"){f(he(t)===1,"Can't have a priority with additional path components");const d=o.getNode();l=e.serverCache.getNode();const u=_i(s,t,d,l);u!=null?a=n.filter.updatePriority(d,u):a=o.getNode()}else{const d=S(t);let u;if(o.isCompleteForChild(c)){l=e.serverCache.getNode();const h=_i(s,t,o.getNode(),l);h!=null?u=o.getNode().getImmediateChild(c).updateChild(d,h):u=o.getNode().getImmediateChild(c)}else u=fs(s,c,e.serverCache);u!=null?a=n.filter.updateChild(o.getNode(),c,u,d,i,r):a=o.getNode()}}return st(e,a,o.isFullyInitialized()||C(t),n.filter.filtersNodes())}}function Gt(n,e,t,s,i,r,o,a){const l=e.serverCache;let c;const d=o?n.filter:n.filter.getIndexedFilter();if(C(t))c=d.updateFullNode(l.getNode(),s,null);else if(d.filtersNodes()&&!l.isFiltered()){const p=l.getNode().updateChild(t,s);c=d.updateFullNode(l.getNode(),p,null)}else{const p=v(t);if(!l.isCompleteForPath(t)&&he(t)>1)return e;const _=S(t),O=l.getNode().getImmediateChild(p).updateChild(_,s);p===".priority"?c=d.updatePriority(l.getNode(),O):c=d.updateChild(l.getNode(),p,O,_,Dr,null)}const u=Sr(e,c,l.isFullyInitialized()||C(t),d.filtersNodes()),h=new ps(i,u,r);return Pr(n,u,t,i,h,a)}function jn(n,e,t,s,i,r,o){const a=e.eventCache;let l,c;const d=new ps(i,e,r);if(C(t))c=n.filter.updateFullNode(e.eventCache.getNode(),s,o),l=st(e,c,!0,n.filter.filtersNodes());else{const u=v(t);if(u===".priority")c=n.filter.updatePriority(e.eventCache.getNode(),s),l=st(e,c,a.isFullyInitialized(),a.isFiltered());else{const h=S(t),p=a.getNode().getImmediateChild(u);let _;if(C(h))_=s;else{const E=d.getCompleteChild(u);E!=null?ss(h)===".priority"&&E.getChild(gr(h)).isEmpty()?_=E:_=E.updateChild(h,s):_=m.EMPTY_NODE}if(p.equals(_))l=e;else{const E=n.filter.updateChild(a.getNode(),u,_,h,d,o);l=st(e,E,a.isFullyInitialized(),n.filter.filtersNodes())}}}return l}function mi(n,e){return n.eventCache.isCompleteForChild(e)}function Qc(n,e,t,s,i,r,o){let a=e;return s.foreach((l,c)=>{const d=P(t,l);mi(e,v(d))&&(a=jn(n,a,d,c,i,r,o))}),s.foreach((l,c)=>{const d=P(t,l);mi(e,v(d))||(a=jn(n,a,d,c,i,r,o))}),a}function gi(n,e,t){return t.foreach((s,i)=>{e=e.updateChild(s,i)}),e}function Vn(n,e,t,s,i,r,o,a){if(e.serverCache.getNode().isEmpty()&&!e.serverCache.isFullyInitialized())return e;let l=e,c;C(t)?c=s:c=new N(null).setTree(t,s);const d=e.serverCache.getNode();return c.children.inorderTraversal((u,h)=>{if(d.hasChild(u)){const p=e.serverCache.getNode().getImmediateChild(u),_=gi(n,p,h);l=Gt(n,l,new I(u),_,i,r,o,a)}}),c.children.inorderTraversal((u,h)=>{const p=!e.serverCache.isCompleteForChild(u)&&h.value===null;if(!d.hasChild(u)&&!p){const _=e.serverCache.getNode().getImmediateChild(u),E=gi(n,_,h);l=Gt(n,l,new I(u),E,i,r,o,a)}}),l}function Xc(n,e,t,s,i,r,o){if(Vt(i,t)!=null)return e;const a=e.serverCache.isFiltered(),l=e.serverCache;if(s.value!=null){if(C(t)&&l.isFullyInitialized()||l.isCompleteForPath(t))return Gt(n,e,t,l.getNode().getChild(t),i,r,a,o);if(C(t)){let c=new N(null);return l.getNode().forEachChild(Le,(d,u)=>{c=c.set(new I(d),u)}),Vn(n,e,t,c,i,r,a,o)}else return e}else{let c=new N(null);return s.foreach((d,u)=>{const h=P(t,d);l.isCompleteForPath(h)&&(c=c.set(d,l.getNode().getChild(h)))}),Vn(n,e,t,c,i,r,a,o)}}function Jc(n,e,t,s,i){const r=e.serverCache,o=Sr(e,r.getNode(),r.isFullyInitialized()||C(t),r.isFiltered());return Pr(n,o,t,s,Dr,i)}function Zc(n,e,t,s,i,r){let o;if(Vt(s,t)!=null)return e;{const a=new ps(s,e,i),l=e.eventCache.getNode();let c;if(C(t)||v(t)===".priority"){let d;if(e.serverCache.isFullyInitialized())d=jt(s,Ie(e));else{const u=e.serverCache.getNode();f(u instanceof m,"serverChildren would be complete if leaf node"),d=ds(s,u)}d=d,c=n.filter.updateFullNode(l,d,r)}else{const d=v(t);let u=fs(s,d,e.serverCache);u==null&&e.serverCache.isCompleteForChild(d)&&(u=l.getImmediateChild(d)),u!=null?c=n.filter.updateChild(l,d,u,S(t),a,r):e.eventCache.getNode().hasChild(d)?c=n.filter.updateChild(l,d,m.EMPTY_NODE,S(t),a,r):c=l,c.isEmpty()&&e.serverCache.isFullyInitialized()&&(o=jt(s,Ie(e)),o.isLeafNode()&&(c=n.filter.updateFullNode(c,o,r)))}return o=e.serverCache.isFullyInitialized()||Vt(s,w())!=null,st(e,c,o,n.filter.filtersNodes())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class eu{constructor(e,t){this.query_=e,this.eventRegistrations_=[];const s=this.query_._queryParams,i=new as(s.getIndex()),r=yc(s);this.processor_=qc(r);const o=t.serverCache,a=t.eventCache,l=i.updateFullNode(m.EMPTY_NODE,o.getNode(),null),c=r.updateFullNode(m.EMPTY_NODE,a.getNode(),null),d=new de(l,o.isFullyInitialized(),i.filtersNodes()),u=new de(c,a.isFullyInitialized(),r.filtersNodes());this.viewCache_=en(u,d),this.eventGenerator_=new Sc(this.query_)}get query(){return this.query_}}function tu(n){return n.viewCache_.serverCache.getNode()}function nu(n){return Ht(n.viewCache_)}function su(n,e){const t=Ie(n.viewCache_);return t&&(n.query._queryParams.loadsAllData()||!C(e)&&!t.getImmediateChild(v(e)).isEmpty())?t.getChild(e):null}function yi(n){return n.eventRegistrations_.length===0}function iu(n,e){n.eventRegistrations_.push(e)}function vi(n,e,t){const s=[];if(t){f(e==null,"A cancel should cancel all event registrations.");const i=n.query._path;n.eventRegistrations_.forEach(r=>{const o=r.createCancelEvent(t,i);o&&s.push(o)})}if(e){let i=[];for(let r=0;r<n.eventRegistrations_.length;++r){const o=n.eventRegistrations_[r];if(!o.matches(e))i.push(o);else if(e.hasAnyCallback()){i=i.concat(n.eventRegistrations_.slice(r+1));break}}n.eventRegistrations_=i}else n.eventRegistrations_=[];return s}function Ci(n,e,t,s){e.type===z.MERGE&&e.source.queryId!==null&&(f(Ie(n.viewCache_),"We should always have a full cache before handling merges"),f(Ht(n.viewCache_),"Missing event cache, even though we have a server cache"));const i=n.viewCache_,r=Yc(n.processor_,i,e,t,s);return zc(n.processor_,r.viewCache),f(r.viewCache.serverCache.isFullyInitialized()||!i.serverCache.isFullyInitialized(),"Once a server snap is complete, it should never go back"),n.viewCache_=r.viewCache,Or(n,r.changes,r.viewCache.eventCache.getNode(),null)}function ru(n,e){const t=n.viewCache_.eventCache,s=[];return t.getNode().isLeafNode()||t.getNode().forEachChild(A,(r,o)=>{s.push(Be(r,o))}),t.isFullyInitialized()&&s.push(Ir(t.getNode())),Or(n,s,t.getNode(),e)}function Or(n,e,t,s){const i=s?[s]:n.eventRegistrations_;return Tc(n.eventGenerator_,e,t,i)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let qt;class xr{constructor(){this.views=new Map}}function ou(n){f(!qt,"__referenceConstructor has already been defined"),qt=n}function au(){return f(qt,"Reference.ts has not been loaded"),qt}function lu(n){return n.views.size===0}function _s(n,e,t,s){const i=e.source.queryId;if(i!==null){const r=n.views.get(i);return f(r!=null,"SyncTree gave us an op for an invalid query."),Ci(r,e,t,s)}else{let r=[];for(const o of n.views.values())r=r.concat(Ci(o,e,t,s));return r}}function Mr(n,e,t,s,i){const r=e._queryIdentifier,o=n.views.get(r);if(!o){let a=jt(t,i?s:null),l=!1;a?l=!0:s instanceof m?(a=ds(t,s),l=!1):(a=m.EMPTY_NODE,l=!1);const c=en(new de(a,l,!1),new de(s,i,!1));return new eu(e,c)}return o}function cu(n,e,t,s,i,r){const o=Mr(n,e,s,i,r);return n.views.has(e._queryIdentifier)||n.views.set(e._queryIdentifier,o),iu(o,t),ru(o,t)}function uu(n,e,t,s){const i=e._queryIdentifier,r=[];let o=[];const a=fe(n);if(i==="default")for(const[l,c]of n.views.entries())o=o.concat(vi(c,t,s)),yi(c)&&(n.views.delete(l),c.query._queryParams.loadsAllData()||r.push(c.query));else{const l=n.views.get(i);l&&(o=o.concat(vi(l,t,s)),yi(l)&&(n.views.delete(i),l.query._queryParams.loadsAllData()||r.push(l.query)))}return a&&!fe(n)&&r.push(new(au())(e._repo,e._path)),{removed:r,events:o}}function Lr(n){const e=[];for(const t of n.views.values())t.query._queryParams.loadsAllData()||e.push(t);return e}function ue(n,e){let t=null;for(const s of n.views.values())t=t||su(s,e);return t}function Fr(n,e){if(e._queryParams.loadsAllData())return nn(n);{const s=e._queryIdentifier;return n.views.get(s)}}function $r(n,e){return Fr(n,e)!=null}function fe(n){return nn(n)!=null}function nn(n){for(const e of n.views.values())if(e.query._queryParams.loadsAllData())return e;return null}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let zt;function hu(n){f(!zt,"__referenceConstructor has already been defined"),zt=n}function du(){return f(zt,"Reference.ts has not been loaded"),zt}let fu=1;class bi{constructor(e){this.listenProvider_=e,this.syncPointTree_=new N(null),this.pendingWriteTree_=Hc(),this.tagToQueryMap=new Map,this.queryToTagMap=new Map}}function ms(n,e,t,s,i){return Ac(n.pendingWriteTree_,e,t,s,i),i?ze(n,new we(cs(),e,t)):[]}function pu(n,e,t,s){Dc(n.pendingWriteTree_,e,t,s);const i=N.fromObject(t);return ze(n,new We(cs(),e,i))}function oe(n,e,t=!1){const s=Pc(n.pendingWriteTree_,e);if(Oc(n.pendingWriteTree_,e)){let r=new N(null);return s.snap!=null?r=r.set(w(),!0):$(s.children,o=>{r=r.set(new I(o),!0)}),ze(n,new Ut(s.path,r,t))}else return[]}function Et(n,e,t){return ze(n,new we(us(),e,t))}function _u(n,e,t){const s=N.fromObject(t);return ze(n,new We(us(),e,s))}function mu(n,e){return ze(n,new _t(us(),e))}function gu(n,e,t){const s=gs(n,t);if(s){const i=ys(s),r=i.path,o=i.queryId,a=B(r,e),l=new _t(hs(o),a);return vs(n,r,l)}else return[]}function Yt(n,e,t,s,i=!1){const r=e._path,o=n.syncPointTree_.get(r);let a=[];if(o&&(e._queryIdentifier==="default"||$r(o,e))){const l=uu(o,e,t,s);lu(o)&&(n.syncPointTree_=n.syncPointTree_.remove(r));const c=l.removed;if(a=l.events,!i){const d=c.findIndex(h=>h._queryParams.loadsAllData())!==-1,u=n.syncPointTree_.findOnPath(r,(h,p)=>fe(p));if(d&&!u){const h=n.syncPointTree_.subtree(r);if(!h.isEmpty()){const p=Cu(h);for(let _=0;_<p.length;++_){const E=p[_],O=E.query,J=Hr(n,E);n.listenProvider_.startListening(rt(O),mt(n,O),J.hashFn,J.onComplete)}}}!u&&c.length>0&&!s&&(d?n.listenProvider_.stopListening(rt(e),null):c.forEach(h=>{const p=n.queryToTagMap.get(rn(h));n.listenProvider_.stopListening(rt(h),p)}))}bu(n,c)}return a}function Br(n,e,t,s){const i=gs(n,s);if(i!=null){const r=ys(i),o=r.path,a=r.queryId,l=B(o,e),c=new we(hs(a),l,t);return vs(n,o,c)}else return[]}function yu(n,e,t,s){const i=gs(n,s);if(i){const r=ys(i),o=r.path,a=r.queryId,l=B(o,e),c=N.fromObject(t),d=new We(hs(a),l,c);return vs(n,o,d)}else return[]}function Gn(n,e,t,s=!1){const i=e._path;let r=null,o=!1;n.syncPointTree_.foreachOnPath(i,(h,p)=>{const _=B(h,i);r=r||ue(p,_),o=o||fe(p)});let a=n.syncPointTree_.get(i);a?(o=o||fe(a),r=r||ue(a,w())):(a=new xr,n.syncPointTree_=n.syncPointTree_.set(i,a));let l;r!=null?l=!0:(l=!1,r=m.EMPTY_NODE,n.syncPointTree_.subtree(i).foreachChild((p,_)=>{const E=ue(_,w());E&&(r=r.updateImmediateChild(p,E))}));const c=$r(a,e);if(!c&&!e._queryParams.loadsAllData()){const h=rn(e);f(!n.queryToTagMap.has(h),"View does not exist, but we have a tag");const p=Eu();n.queryToTagMap.set(h,p),n.tagToQueryMap.set(p,h)}const d=tn(n.pendingWriteTree_,i);let u=cu(a,e,t,d,r,l);if(!c&&!o&&!s){const h=Fr(a,e);u=u.concat(wu(n,e,h))}return u}function sn(n,e,t){const i=n.pendingWriteTree_,r=n.syncPointTree_.findOnPath(e,(o,a)=>{const l=B(o,e),c=ue(a,l);if(c)return c});return Nr(i,e,r,t,!0)}function vu(n,e){const t=e._path;let s=null;n.syncPointTree_.foreachOnPath(t,(c,d)=>{const u=B(c,t);s=s||ue(d,u)});let i=n.syncPointTree_.get(t);i?s=s||ue(i,w()):(i=new xr,n.syncPointTree_=n.syncPointTree_.set(t,i));const r=s!=null,o=r?new de(s,!0,!1):null,a=tn(n.pendingWriteTree_,e._path),l=Mr(i,e,a,r?o.getNode():m.EMPTY_NODE,r);return nu(l)}function ze(n,e){return Wr(e,n.syncPointTree_,null,tn(n.pendingWriteTree_,w()))}function Wr(n,e,t,s){if(C(n.path))return Ur(n,e,t,s);{const i=e.get(w());t==null&&i!=null&&(t=ue(i,w()));let r=[];const o=v(n.path),a=n.operationForChild(o),l=e.children.get(o);if(l&&a){const c=t?t.getImmediateChild(o):null,d=kr(s,o);r=r.concat(Wr(a,l,c,d))}return i&&(r=r.concat(_s(i,n,s,t))),r}}function Ur(n,e,t,s){const i=e.get(w());t==null&&i!=null&&(t=ue(i,w()));let r=[];return e.children.inorderTraversal((o,a)=>{const l=t?t.getImmediateChild(o):null,c=kr(s,o),d=n.operationForChild(o);d&&(r=r.concat(Ur(d,a,l,c)))}),i&&(r=r.concat(_s(i,n,s,t))),r}function Hr(n,e){const t=e.query,s=mt(n,t);return{hashFn:()=>(tu(e)||m.EMPTY_NODE).hash(),onComplete:i=>{if(i==="ok")return s?gu(n,t._path,s):mu(n,t._path);{const r=ml(i,t);return Yt(n,t,null,r)}}}}function mt(n,e){const t=rn(e);return n.queryToTagMap.get(t)}function rn(n){return n._path.toString()+"$"+n._queryIdentifier}function gs(n,e){return n.tagToQueryMap.get(e)}function ys(n){const e=n.indexOf("$");return f(e!==-1&&e<n.length-1,"Bad queryKey."),{queryId:n.substr(e+1),path:new I(n.substr(0,e))}}function vs(n,e,t){const s=n.syncPointTree_.get(e);f(s,"Missing sync point for query tag that we're tracking");const i=tn(n.pendingWriteTree_,e);return _s(s,t,i,null)}function Cu(n){return n.fold((e,t,s)=>{if(t&&fe(t))return[nn(t)];{let i=[];return t&&(i=Lr(t)),$(s,(r,o)=>{i=i.concat(o)}),i}})}function rt(n){return n._queryParams.loadsAllData()&&!n._queryParams.isDefault()?new(du())(n._repo,n._path):n}function bu(n,e){for(let t=0;t<e.length;++t){const s=e[t];if(!s._queryParams.loadsAllData()){const i=rn(s),r=n.queryToTagMap.get(i);n.queryToTagMap.delete(i),n.tagToQueryMap.delete(r)}}}function Eu(){return fu++}function wu(n,e,t){const s=e._path,i=mt(n,e),r=Hr(n,t),o=n.listenProvider_.startListening(rt(e),i,r.hashFn,r.onComplete),a=n.syncPointTree_.subtree(s);if(i)f(!fe(a.value),"If we're adding a query, it shouldn't be shadowed");else{const l=a.fold((c,d,u)=>{if(!C(c)&&d&&fe(d))return[nn(d).query];{let h=[];return d&&(h=h.concat(Lr(d).map(p=>p.query))),$(u,(p,_)=>{h=h.concat(_)}),h}});for(let c=0;c<l.length;++c){const d=l[c];n.listenProvider_.stopListening(rt(d),mt(n,d))}}return o}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Cs{constructor(e){this.node_=e}getImmediateChild(e){const t=this.node_.getImmediateChild(e);return new Cs(t)}node(){return this.node_}}class bs{constructor(e,t){this.syncTree_=e,this.path_=t}getImmediateChild(e){const t=P(this.path_,e);return new bs(this.syncTree_,t)}node(){return sn(this.syncTree_,this.path_)}}const Iu=function(n){return n=n||{},n.timestamp=n.timestamp||new Date().getTime(),n},Ei=function(n,e,t){if(!n||typeof n!="object")return n;if(f(".sv"in n,"Unexpected leaf node or priority contents"),typeof n[".sv"]=="string")return Su(n[".sv"],e,t);if(typeof n[".sv"]=="object")return Tu(n[".sv"],e);f(!1,"Unexpected server value: "+JSON.stringify(n,null,2))},Su=function(n,e,t){switch(n){case"timestamp":return t.timestamp;default:f(!1,"Unexpected server value: "+n)}},Tu=function(n,e,t){n.hasOwnProperty("increment")||f(!1,"Unexpected server value: "+JSON.stringify(n,null,2));const s=n.increment;typeof s!="number"&&f(!1,"Unexpected increment value: "+s);const i=e.node();if(f(i!==null&&typeof i<"u","Expected ChildrenNode.EMPTY_NODE for nulls"),!i.isLeafNode())return s;const o=i.getValue();return typeof o!="number"?s:o+s},jr=function(n,e,t,s){return ws(e,new bs(t,n),s)},Es=function(n,e,t){return ws(n,new Cs(e),t)};function ws(n,e,t){const s=n.getPriority().val(),i=Ei(s,e.getImmediateChild(".priority"),t);let r;if(n.isLeafNode()){const o=n,a=Ei(o.getValue(),e,t);return a!==o.getValue()||i!==o.getPriority().val()?new M(a,D(i)):n}else{const o=n;return r=o,i!==o.getPriority().val()&&(r=r.updatePriority(new M(i))),o.forEachChild(A,(a,l)=>{const c=ws(l,e.getImmediateChild(a),t);c!==l&&(r=r.updateImmediateChild(a,c))}),r}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Is{constructor(e="",t=null,s={children:{},childCount:0}){this.name=e,this.parent=t,this.node=s}}function on(n,e){let t=e instanceof I?e:new I(e),s=n,i=v(t);for(;i!==null;){const r=be(s.node.children,i)||{children:{},childCount:0};s=new Is(i,s,r),t=S(t),i=v(t)}return s}function Ne(n){return n.node.value}function Ss(n,e){n.node.value=e,qn(n)}function Vr(n){return n.node.childCount>0}function Ru(n){return Ne(n)===void 0&&!Vr(n)}function an(n,e){$(n.node.children,(t,s)=>{e(new Is(t,n,s))})}function Gr(n,e,t,s){t&&e(n),an(n,i=>{Gr(i,e,!0)})}function Nu(n,e,t){let s=n.parent;for(;s!==null;){if(e(s))return!0;s=s.parent}return!1}function wt(n){return new I(n.parent===null?n.name:wt(n.parent)+"/"+n.name)}function qn(n){n.parent!==null&&ku(n.parent,n.name,n)}function ku(n,e,t){const s=Ru(t),i=Q(n.node.children,e);s&&i?(delete n.node.children[e],n.node.childCount--,qn(n)):!s&&!i&&(n.node.children[e]=t.node,n.node.childCount++,qn(n))}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Au=/[\[\].#$\/\u0000-\u001F\u007F]/,Du=/[\[\].#$\u0000-\u001F\u007F]/,In=10*1024*1024,Ts=function(n){return typeof n=="string"&&n.length!==0&&!Au.test(n)},qr=function(n){return typeof n=="string"&&n.length!==0&&!Du.test(n)},Pu=function(n){return n&&(n=n.replace(/^\/*\.info(\/|$)/,"/")),qr(n)},Rs=function(n){return n===null||typeof n=="string"||typeof n=="number"&&!Jt(n)||n&&typeof n=="object"&&Q(n,".sv")},zn=function(n,e,t,s){It(Fe(n,"value"),e,t)},It=function(n,e,t){const s=t instanceof I?new Ql(t,n):t;if(e===void 0)throw new Error(n+"contains undefined "+ye(s));if(typeof e=="function")throw new Error(n+"contains a function "+ye(s)+" with contents = "+e.toString());if(Jt(e))throw new Error(n+"contains "+e.toString()+" "+ye(s));if(typeof e=="string"&&e.length>In/3&&Xt(e)>In)throw new Error(n+"contains a string greater than "+In+" utf8 bytes "+ye(s)+" ('"+e.substring(0,50)+"...')");if(e&&typeof e=="object"){let i=!1,r=!1;if($(e,(o,a)=>{if(o===".value")i=!0;else if(o!==".priority"&&o!==".sv"&&(r=!0,!Ts(o)))throw new Error(n+" contains an invalid key ("+o+") "+ye(s)+`.  Keys must be non-empty strings and can't contain ".", "#", "$", "/", "[", or "]"`);Xl(s,o),It(n,a,s),Jl(s)}),i&&r)throw new Error(n+' contains ".value" child '+ye(s)+" in addition to actual children.")}},Ou=function(n,e){let t,s;for(t=0;t<e.length;t++){s=e[t];const r=ht(s);for(let o=0;o<r.length;o++)if(!(r[o]===".priority"&&o===r.length-1)){if(!Ts(r[o]))throw new Error(n+"contains an invalid key ("+r[o]+") in path "+s.toString()+`. Keys must be non-empty strings and can't contain ".", "#", "$", "/", "[", or "]"`)}}e.sort(Kl);let i=null;for(t=0;t<e.length;t++){if(s=e[t],i!==null&&V(i,s))throw new Error(n+"contains a path "+i.toString()+" that is ancestor of another path "+s.toString());i=s}},zr=function(n,e,t,s){const i=Fe(n,"values");if(!(e&&typeof e=="object")||Array.isArray(e))throw new Error(i+" must be an object containing the children to replace.");const r=[];$(e,(o,a)=>{const l=new I(o);if(It(i,a,P(t,l)),ss(l)===".priority"&&!Rs(a))throw new Error(i+"contains an invalid value for '"+l.toString()+"', which must be a valid Firebase priority (a string, finite number, server value, or null).");r.push(l)}),Ou(i,r)},xu=function(n,e,t){if(Jt(e))throw new Error(Fe(n,"priority")+"is "+e.toString()+", but must be a valid Firebase priority (a string, finite number, server value, or null).");if(!Rs(e))throw new Error(Fe(n,"priority")+"must be a valid Firebase priority (a string, finite number, server value, or null).")},Yr=function(n,e,t,s){if(!qr(t))throw new Error(Fe(n,e)+'was an invalid path = "'+t+`". Paths must be non-empty strings and can't contain ".", "#", "$", "[", or "]"`)},Mu=function(n,e,t,s){t&&(t=t.replace(/^\/*\.info(\/|$)/,"/")),Yr(n,e,t)},Oe=function(n,e){if(v(e)===".info")throw new Error(n+" failed = Can't modify data under /.info/")},Lu=function(n,e){const t=e.path.toString();if(typeof e.repoInfo.host!="string"||e.repoInfo.host.length===0||!Ts(e.repoInfo.namespace)&&e.repoInfo.host.split(":")[0]!=="localhost"||t.length!==0&&!Pu(t))throw new Error(Fe(n,"url")+`must be a valid firebase URL and the path can't contain ".", "#", "$", "[", or "]".`)};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Fu{constructor(){this.eventLists_=[],this.recursionDepth_=0}}function ln(n,e){let t=null;for(let s=0;s<e.length;s++){const i=e[s],r=i.getPath();t!==null&&!is(r,t.path)&&(n.eventLists_.push(t),t=null),t===null&&(t={events:[],path:r}),t.events.push(i)}t&&n.eventLists_.push(t)}function Kr(n,e,t){ln(n,t),Qr(n,s=>is(s,e))}function j(n,e,t){ln(n,t),Qr(n,s=>V(s,e)||V(e,s))}function Qr(n,e){n.recursionDepth_++;let t=!0;for(let s=0;s<n.eventLists_.length;s++){const i=n.eventLists_[s];if(i){const r=i.path;e(r)?($u(n.eventLists_[s]),n.eventLists_[s]=null):t=!1}}t&&(n.eventLists_=[]),n.recursionDepth_--}function $u(n){for(let e=0;e<n.events.length;e++){const t=n.events[e];if(t!==null){n.events[e]=null;const s=t.getEventRunner();tt&&F("event: "+t.toString()),Ge(s)}}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Bu="repo_interrupt",Wu=25;class Uu{constructor(e,t,s,i){this.repoInfo_=e,this.forceRestClient_=t,this.authTokenProvider_=s,this.appCheckProvider_=i,this.dataUpdateCount=0,this.statsListener_=null,this.eventQueue_=new Fu,this.nextWriteId_=1,this.interceptServerDataCallback_=null,this.onDisconnect_=Wt(),this.transactionQueueTree_=new Is,this.persistentConnection_=null,this.key=this.repoInfo_.toURLString()}toString(){return(this.repoInfo_.secure?"https://":"http://")+this.repoInfo_.host}}function Hu(n,e,t){if(n.stats_=ts(n.repoInfo_),n.forceRestClient_||Cl())n.server_=new Bt(n.repoInfo_,(s,i,r,o)=>{wi(n,s,i,r,o)},n.authTokenProvider_,n.appCheckProvider_),setTimeout(()=>Ii(n,!0),0);else{if(typeof t<"u"&&t!==null){if(typeof t!="object")throw new Error("Only objects are supported for option databaseAuthVariableOverride");try{x(t)}catch(s){throw new Error("Invalid authOverride provided: "+s)}}n.persistentConnection_=new ne(n.repoInfo_,e,(s,i,r,o)=>{wi(n,s,i,r,o)},s=>{Ii(n,s)},s=>{Vu(n,s)},n.authTokenProvider_,n.appCheckProvider_,t),n.server_=n.persistentConnection_}n.authTokenProvider_.addTokenChangeListener(s=>{n.server_.refreshAuthToken(s)}),n.appCheckProvider_.addTokenChangeListener(s=>{n.server_.refreshAppCheckToken(s.token)}),n.statsReporter_=Sl(n.repoInfo_,()=>new Ic(n.stats_,n.server_)),n.infoData_=new vc,n.infoSyncTree_=new bi({startListening:(s,i,r,o)=>{let a=[];const l=n.infoData_.getNode(s._path);return l.isEmpty()||(a=Et(n.infoSyncTree_,s._path,l),setTimeout(()=>{o("ok")},0)),a},stopListening:()=>{}}),Ns(n,"connected",!1),n.serverSyncTree_=new bi({startListening:(s,i,r,o)=>(n.server_.listen(s,r,i,(a,l)=>{const c=o(a,l);j(n.eventQueue_,s._path,c)}),[]),stopListening:(s,i)=>{n.server_.unlisten(s,i)}})}function ju(n){const t=n.infoData_.getNode(new I(".info/serverTimeOffset")).val()||0;return new Date().getTime()+t}function St(n){return Iu({timestamp:ju(n)})}function wi(n,e,t,s,i){n.dataUpdateCount++;const r=new I(e);t=n.interceptServerDataCallback_?n.interceptServerDataCallback_(e,t):t;let o=[];if(i)if(s){const l=Pt(t,c=>D(c));o=yu(n.serverSyncTree_,r,l,i)}else{const l=D(t);o=Br(n.serverSyncTree_,r,l,i)}else if(s){const l=Pt(t,c=>D(c));o=_u(n.serverSyncTree_,r,l)}else{const l=D(t);o=Et(n.serverSyncTree_,r,l)}let a=r;o.length>0&&(a=He(n,r)),j(n.eventQueue_,a,o)}function Ii(n,e){Ns(n,"connected",e),e===!1&&Yu(n)}function Vu(n,e){$(e,(t,s)=>{Ns(n,t,s)})}function Ns(n,e,t){const s=new I("/.info/"+e),i=D(t);n.infoData_.updateSnapshot(s,i);const r=Et(n.infoSyncTree_,s,i);j(n.eventQueue_,s,r)}function cn(n){return n.nextWriteId_++}function Gu(n,e,t){const s=vu(n.serverSyncTree_,e);return s!=null?Promise.resolve(s):n.server_.get(e).then(i=>{const r=D(i).withIndex(e._queryParams.getIndex());Gn(n.serverSyncTree_,e,t,!0);let o;if(e._queryParams.loadsAllData())o=Et(n.serverSyncTree_,e._path,r);else{const a=mt(n.serverSyncTree_,e);o=Br(n.serverSyncTree_,e._path,r,a)}return j(n.eventQueue_,e._path,o),Yt(n.serverSyncTree_,e,t,null,!0),r},i=>(Ye(n,"get for query "+x(e)+" failed: "+i),Promise.reject(new Error(i))))}function qu(n,e,t,s,i){Ye(n,"set",{path:e.toString(),value:t,priority:s});const r=St(n),o=D(t,s),a=sn(n.serverSyncTree_,e),l=Es(o,a,r),c=cn(n),d=ms(n.serverSyncTree_,e,l,c,!0);ln(n.eventQueue_,d),n.server_.put(e.toString(),o.val(!0),(h,p)=>{const _=h==="ok";_||W("set at "+e+" failed: "+h);const E=oe(n.serverSyncTree_,c,!_);j(n.eventQueue_,e,E),pe(n,i,h,p)});const u=As(n,e);He(n,u),j(n.eventQueue_,u,[])}function zu(n,e,t,s){Ye(n,"update",{path:e.toString(),value:t});let i=!0;const r=St(n),o={};if($(t,(a,l)=>{i=!1,o[a]=jr(P(e,a),D(l),n.serverSyncTree_,r)}),i)F("update() called with empty data.  Don't do anything."),pe(n,s,"ok",void 0);else{const a=cn(n),l=pu(n.serverSyncTree_,e,o,a);ln(n.eventQueue_,l),n.server_.merge(e.toString(),t,(c,d)=>{const u=c==="ok";u||W("update at "+e+" failed: "+c);const h=oe(n.serverSyncTree_,a,!u),p=h.length>0?He(n,e):e;j(n.eventQueue_,p,h),pe(n,s,c,d)}),$(t,c=>{const d=As(n,P(e,c));He(n,d)}),j(n.eventQueue_,e,[])}}function Yu(n){Ye(n,"onDisconnectEvents");const e=St(n),t=Wt();Bn(n.onDisconnect_,w(),(i,r)=>{const o=jr(i,r,n.serverSyncTree_,e);qe(t,i,o)});let s=[];Bn(t,w(),(i,r)=>{s=s.concat(Et(n.serverSyncTree_,i,r));const o=As(n,i);He(n,o)}),n.onDisconnect_=Wt(),j(n.eventQueue_,w(),s)}function Ku(n,e,t){n.server_.onDisconnectCancel(e.toString(),(s,i)=>{s==="ok"&&$n(n.onDisconnect_,e),pe(n,t,s,i)})}function Si(n,e,t,s){const i=D(t);n.server_.onDisconnectPut(e.toString(),i.val(!0),(r,o)=>{r==="ok"&&qe(n.onDisconnect_,e,i),pe(n,s,r,o)})}function Qu(n,e,t,s,i){const r=D(t,s);n.server_.onDisconnectPut(e.toString(),r.val(!0),(o,a)=>{o==="ok"&&qe(n.onDisconnect_,e,r),pe(n,i,o,a)})}function Xu(n,e,t,s){if(kn(t)){F("onDisconnect().update() called with empty data.  Don't do anything."),pe(n,s,"ok",void 0);return}n.server_.onDisconnectMerge(e.toString(),t,(i,r)=>{i==="ok"&&$(t,(o,a)=>{const l=D(a);qe(n.onDisconnect_,P(e,o),l)}),pe(n,s,i,r)})}function Ju(n,e,t){let s;v(e._path)===".info"?s=Gn(n.infoSyncTree_,e,t):s=Gn(n.serverSyncTree_,e,t),Kr(n.eventQueue_,e._path,s)}function Zu(n,e,t){let s;v(e._path)===".info"?s=Yt(n.infoSyncTree_,e,t):s=Yt(n.serverSyncTree_,e,t),Kr(n.eventQueue_,e._path,s)}function eh(n){n.persistentConnection_&&n.persistentConnection_.interrupt(Bu)}function Ye(n,...e){let t="";n.persistentConnection_&&(t=n.persistentConnection_.id+":"),F(t,...e)}function pe(n,e,t,s){e&&Ge(()=>{if(t==="ok")e(null);else{const i=(t||"error").toUpperCase();let r=i;s&&(r+=": "+s);const o=new Error(r);o.code=i,e(o)}})}function th(n,e,t,s,i,r){Ye(n,"transaction on "+e);const o={path:e,update:t,onComplete:s,status:null,order:Ki(),applyLocally:r,retryCount:0,unwatcher:i,abortReason:null,currentWriteId:null,currentInputSnapshot:null,currentOutputSnapshotRaw:null,currentOutputSnapshotResolved:null},a=ks(n,e,void 0);o.currentInputSnapshot=a;const l=o.update(a.val());if(l===void 0)o.unwatcher(),o.currentOutputSnapshotRaw=null,o.currentOutputSnapshotResolved=null,o.onComplete&&o.onComplete(null,!1,o.currentInputSnapshot);else{It("transaction failed: Data returned ",l,o.path),o.status=0;const c=on(n.transactionQueueTree_,e),d=Ne(c)||[];d.push(o),Ss(c,d);let u;typeof l=="object"&&l!==null&&Q(l,".priority")?(u=be(l,".priority"),f(Rs(u),"Invalid priority returned by transaction. Priority must be a valid string, finite number, server value, or null.")):u=(sn(n.serverSyncTree_,e)||m.EMPTY_NODE).getPriority().val();const h=St(n),p=D(l,u),_=Es(p,a,h);o.currentOutputSnapshotRaw=p,o.currentOutputSnapshotResolved=_,o.currentWriteId=cn(n);const E=ms(n.serverSyncTree_,e,_,o.currentWriteId,o.applyLocally);j(n.eventQueue_,e,E),un(n,n.transactionQueueTree_)}}function ks(n,e,t){return sn(n.serverSyncTree_,e,t)||m.EMPTY_NODE}function un(n,e=n.transactionQueueTree_){if(e||hn(n,e),Ne(e)){const t=Jr(n,e);f(t.length>0,"Sending zero length transaction queue"),t.every(i=>i.status===0)&&nh(n,wt(e),t)}else Vr(e)&&an(e,t=>{un(n,t)})}function nh(n,e,t){const s=t.map(c=>c.currentWriteId),i=ks(n,e,s);let r=i;const o=i.hash();for(let c=0;c<t.length;c++){const d=t[c];f(d.status===0,"tryToSendTransactionQueue_: items in queue should all be run."),d.status=1,d.retryCount++;const u=B(e,d.path);r=r.updateChild(u,d.currentOutputSnapshotRaw)}const a=r.val(!0),l=e;n.server_.put(l.toString(),a,c=>{Ye(n,"transaction put response",{path:l.toString(),status:c});let d=[];if(c==="ok"){const u=[];for(let h=0;h<t.length;h++)t[h].status=2,d=d.concat(oe(n.serverSyncTree_,t[h].currentWriteId)),t[h].onComplete&&u.push(()=>t[h].onComplete(null,!0,t[h].currentOutputSnapshotResolved)),t[h].unwatcher();hn(n,on(n.transactionQueueTree_,e)),un(n,n.transactionQueueTree_),j(n.eventQueue_,e,d);for(let h=0;h<u.length;h++)Ge(u[h])}else{if(c==="datastale")for(let u=0;u<t.length;u++)t[u].status===3?t[u].status=4:t[u].status=0;else{W("transaction at "+l.toString()+" failed: "+c);for(let u=0;u<t.length;u++)t[u].status=4,t[u].abortReason=c}He(n,e)}},o)}function He(n,e){const t=Xr(n,e),s=wt(t),i=Jr(n,t);return sh(n,i,s),s}function sh(n,e,t){if(e.length===0)return;const s=[];let i=[];const o=e.filter(a=>a.status===0).map(a=>a.currentWriteId);for(let a=0;a<e.length;a++){const l=e[a],c=B(t,l.path);let d=!1,u;if(f(c!==null,"rerunTransactionsUnderNode_: relativePath should not be null."),l.status===4)d=!0,u=l.abortReason,i=i.concat(oe(n.serverSyncTree_,l.currentWriteId,!0));else if(l.status===0)if(l.retryCount>=Wu)d=!0,u="maxretry",i=i.concat(oe(n.serverSyncTree_,l.currentWriteId,!0));else{const h=ks(n,l.path,o);l.currentInputSnapshot=h;const p=e[a].update(h.val());if(p!==void 0){It("transaction failed: Data returned ",p,l.path);let _=D(p);typeof p=="object"&&p!=null&&Q(p,".priority")||(_=_.updatePriority(h.getPriority()));const O=l.currentWriteId,J=St(n),Z=Es(_,h,J);l.currentOutputSnapshotRaw=_,l.currentOutputSnapshotResolved=Z,l.currentWriteId=cn(n),o.splice(o.indexOf(O),1),i=i.concat(ms(n.serverSyncTree_,l.path,Z,l.currentWriteId,l.applyLocally)),i=i.concat(oe(n.serverSyncTree_,O,!0))}else d=!0,u="nodata",i=i.concat(oe(n.serverSyncTree_,l.currentWriteId,!0))}j(n.eventQueue_,t,i),i=[],d&&(e[a].status=2,(function(h){setTimeout(h,Math.floor(0))})(e[a].unwatcher),e[a].onComplete&&(u==="nodata"?s.push(()=>e[a].onComplete(null,!1,e[a].currentInputSnapshot)):s.push(()=>e[a].onComplete(new Error(u),!1,null))))}hn(n,n.transactionQueueTree_);for(let a=0;a<s.length;a++)Ge(s[a]);un(n,n.transactionQueueTree_)}function Xr(n,e){let t,s=n.transactionQueueTree_;for(t=v(e);t!==null&&Ne(s)===void 0;)s=on(s,t),e=S(e),t=v(e);return s}function Jr(n,e){const t=[];return Zr(n,e,t),t.sort((s,i)=>s.order-i.order),t}function Zr(n,e,t){const s=Ne(e);if(s)for(let i=0;i<s.length;i++)t.push(s[i]);an(e,i=>{Zr(n,i,t)})}function hn(n,e){const t=Ne(e);if(t){let s=0;for(let i=0;i<t.length;i++)t[i].status!==2&&(t[s]=t[i],s++);t.length=s,Ss(e,t.length>0?t:void 0)}an(e,s=>{hn(n,s)})}function As(n,e){const t=wt(Xr(n,e)),s=on(n.transactionQueueTree_,e);return Nu(s,i=>{Sn(n,i)}),Sn(n,s),Gr(s,i=>{Sn(n,i)}),t}function Sn(n,e){const t=Ne(e);if(t){const s=[];let i=[],r=-1;for(let o=0;o<t.length;o++)t[o].status===3||(t[o].status===1?(f(r===o-1,"All SENT items should be at beginning of queue."),r=o,t[o].status=3,t[o].abortReason="set"):(f(t[o].status===0,"Unexpected transaction status in abort"),t[o].unwatcher(),i=i.concat(oe(n.serverSyncTree_,t[o].currentWriteId,!0)),t[o].onComplete&&s.push(t[o].onComplete.bind(null,new Error("set"),!1,null))));r===-1?Ss(e,void 0):t.length=r+1,j(n.eventQueue_,wt(e),i);for(let o=0;o<s.length;o++)Ge(s[o])}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ih(n){let e="";const t=n.split("/");for(let s=0;s<t.length;s++)if(t[s].length>0){let i=t[s];try{i=decodeURIComponent(i.replace(/\+/g," "))}catch{}e+="/"+i}return e}function rh(n){const e={};n.charAt(0)==="?"&&(n=n.substring(1));for(const t of n.split("&")){if(t.length===0)continue;const s=t.split("=");s.length===2?e[decodeURIComponent(s[0])]=decodeURIComponent(s[1]):W(`Invalid query segment '${t}' in query '${n}'`)}return e}const Ti=function(n,e){const t=oh(n),s=t.namespace;t.domain==="firebase.com"&&ie(t.host+" is no longer supported. Please use <YOUR FIREBASE>.firebaseio.com instead"),(!s||s==="undefined")&&t.domain!=="localhost"&&ie("Cannot parse Firebase url. Please use https://<YOUR FIREBASE>.firebaseio.com"),t.secure||hl();const i=t.scheme==="ws"||t.scheme==="wss";return{repoInfo:new lr(t.host,t.secure,s,i,e,"",s!==t.subdomain),path:new I(t.pathString)}},oh=function(n){let e="",t="",s="",i="",r="",o=!0,a="https",l=443;if(typeof n=="string"){let c=n.indexOf("//");c>=0&&(a=n.substring(0,c-1),n=n.substring(c+2));let d=n.indexOf("/");d===-1&&(d=n.length);let u=n.indexOf("?");u===-1&&(u=n.length),e=n.substring(0,Math.min(d,u)),d<u&&(i=ih(n.substring(d,u)));const h=rh(n.substring(Math.min(n.length,u)));c=e.indexOf(":"),c>=0?(o=a==="https"||a==="wss",l=parseInt(e.substring(c+1),10)):c=e.length;const p=e.slice(0,c);if(p.toLowerCase()==="localhost")t="localhost";else if(p.split(".").length<=2)t=p;else{const _=e.indexOf(".");s=e.substring(0,_).toLowerCase(),t=e.substring(_+1),r=s}"ns"in h&&(r=h.ns)}return{host:e,port:l,domain:t,subdomain:s,secure:o,scheme:a,pathString:i,namespace:r}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ah{constructor(e,t,s,i){this.eventType=e,this.eventRegistration=t,this.snapshot=s,this.prevName=i}getPath(){const e=this.snapshot.ref;return this.eventType==="value"?e._path:e.parent._path}getEventType(){return this.eventType}getEventRunner(){return this.eventRegistration.getEventRunner(this)}toString(){return this.getPath().toString()+":"+this.eventType+":"+x(this.snapshot.exportVal())}}class lh{constructor(e,t,s){this.eventRegistration=e,this.error=t,this.path=s}getPath(){return this.path}getEventType(){return"cancel"}getEventRunner(){return this.eventRegistration.getEventRunner(this)}toString(){return this.path.toString()+":cancel"}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class eo{constructor(e,t){this.snapshotCallback=e,this.cancelCallback=t}onValue(e,t){this.snapshotCallback.call(null,e,t)}onCancel(e){return f(this.hasCancelCallback,"Raising a cancel event on a listener with no cancel callback"),this.cancelCallback.call(null,e)}get hasCancelCallback(){return!!this.cancelCallback}matches(e){return this.snapshotCallback===e.snapshotCallback||this.snapshotCallback.userCallback!==void 0&&this.snapshotCallback.userCallback===e.snapshotCallback.userCallback&&this.snapshotCallback.context===e.snapshotCallback.context}}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ch{constructor(e,t){this._repo=e,this._path=t}cancel(){const e=new G;return Ku(this._repo,this._path,e.wrapCallback(()=>{})),e.promise}remove(){Oe("OnDisconnect.remove",this._path);const e=new G;return Si(this._repo,this._path,null,e.wrapCallback(()=>{})),e.promise}set(e){Oe("OnDisconnect.set",this._path),zn("OnDisconnect.set",e,this._path);const t=new G;return Si(this._repo,this._path,e,t.wrapCallback(()=>{})),t.promise}setWithPriority(e,t){Oe("OnDisconnect.setWithPriority",this._path),zn("OnDisconnect.setWithPriority",e,this._path),xu("OnDisconnect.setWithPriority",t);const s=new G;return Qu(this._repo,this._path,e,t,s.wrapCallback(()=>{})),s.promise}update(e){Oe("OnDisconnect.update",this._path),zr("OnDisconnect.update",e,this._path);const t=new G;return Xu(this._repo,this._path,e,t.wrapCallback(()=>{})),t.promise}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ds{constructor(e,t,s,i){this._repo=e,this._path=t,this._queryParams=s,this._orderByCalled=i}get key(){return C(this._path)?null:ss(this._path)}get ref(){return new X(this._repo,this._path)}get _queryIdentifier(){const e=hi(this._queryParams),t=Zn(e);return t==="{}"?"default":t}get _queryObject(){return hi(this._queryParams)}isEqual(e){if(e=_e(e),!(e instanceof Ds))return!1;const t=this._repo===e._repo,s=is(this._path,e._path),i=this._queryIdentifier===e._queryIdentifier;return t&&s&&i}toJSON(){return this.toString()}toString(){return this._repo.toString()+Yl(this._path)}}class X extends Ds{constructor(e,t){super(e,t,new ls,!1)}get parent(){const e=gr(this._path);return e===null?null:new X(this._repo,e)}get root(){let e=this;for(;e.parent!==null;)e=e.parent;return e}}class je{constructor(e,t,s){this._node=e,this.ref=t,this._index=s}get priority(){return this._node.getPriority().val()}get key(){return this.ref.key}get size(){return this._node.numChildren()}child(e){const t=new I(e),s=Yn(this.ref,e);return new je(this._node.getChild(t),s,A)}exists(){return!this._node.isEmpty()}exportVal(){return this._node.val(!0)}forEach(e){return this._node.isLeafNode()?!1:!!this._node.forEachChild(this._index,(s,i)=>e(new je(i,Yn(this.ref,s),A)))}hasChild(e){const t=new I(e);return!this._node.getChild(t).isEmpty()}hasChildren(){return this._node.isLeafNode()?!1:!this._node.isEmpty()}toJSON(){return this.exportVal()}val(){return this._node.val()}}function T(n,e){return n=_e(n),n._checkNotDeleted("ref"),e!==void 0?Yn(n._root,e):n._root}function Yn(n,e){return n=_e(n),v(n._path)===null?Mu("child","path",e):Yr("child","path",e),new X(n._repo,P(n._path,e))}function to(n){return n=_e(n),new ch(n._repo,n._path)}function Ri(n,e){n=_e(n),Oe("set",n._path),zn("set",e,n._path);const t=new G;return qu(n._repo,n._path,e,null,t.wrapCallback(()=>{})),t.promise}function ke(n,e){zr("update",e,n._path);const t=new G;return zu(n._repo,n._path,e,t.wrapCallback(()=>{})),t.promise}function Se(n){n=_e(n);const e=new eo(()=>{}),t=new dn(e);return Gu(n._repo,n,t).then(s=>new je(s,new X(n._repo,n._path),n._queryParams.getIndex()))}class dn{constructor(e){this.callbackContext=e}respondsTo(e){return e==="value"}createEvent(e,t){const s=t._queryParams.getIndex();return new ah("value",this,new je(e.snapshotNode,new X(t._repo,t._path),s))}getEventRunner(e){return e.getEventType()==="cancel"?()=>this.callbackContext.onCancel(e.error):()=>this.callbackContext.onValue(e.snapshot,null)}createCancelEvent(e,t){return this.callbackContext.hasCancelCallback?new lh(this,e,t):null}matches(e){return e instanceof dn?!e.callbackContext||!this.callbackContext?!0:e.callbackContext.matches(this.callbackContext):!1}hasAnyCallback(){return this.callbackContext!==null}}function uh(n,e,t,s,i){const r=new eo(t,void 0),o=new dn(r);return Ju(n._repo,n,o),()=>Zu(n._repo,n,o)}function fn(n,e,t,s){return uh(n,"value",e)}ou(X);hu(X);/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const hh="FIREBASE_DATABASE_EMULATOR_HOST",Kn={};let dh=!1;function fh(n,e,t,s){const i=e.lastIndexOf(":"),r=e.substring(0,i),o=Xn(r);n.repoInfo_=new lr(e,o,n.repoInfo_.namespace,n.repoInfo_.webSocketOnly,n.repoInfo_.nodeAdmin,n.repoInfo_.persistenceKey,n.repoInfo_.includeNamespaceInQueryParams,!0,t),s&&(n.authTokenProvider_=s)}function ph(n,e,t,s,i){let r=s||n.options.databaseURL;r===void 0&&(n.options.projectId||ie("Can't determine Firebase Database URL. Be sure to include  a Project ID when calling firebase.initializeApp()."),F("Using default host for project ",n.options.projectId),r=`${n.options.projectId}-default-rtdb.firebaseio.com`);let o=Ti(r,i),a=o.repoInfo,l;typeof process<"u"&&zs&&(l=zs[hh]),l?(r=`http://${l}?ns=${a.namespace}`,o=Ti(r,i),a=o.repoInfo):o.repoInfo.secure;const c=new El(n.name,n.options,e);Lu("Invalid Firebase Database URL",o),C(o.path)||ie("Database URL must point to the root of a Firebase Database (not including a child path).");const d=mh(a,n,c,new bl(n,t));return new gh(d,n)}function _h(n,e){const t=Kn[e];(!t||t[n.key]!==n)&&ie(`Database ${e}(${n.repoInfo_}) has already been deleted.`),eh(n),delete t[n.key]}function mh(n,e,t,s){let i=Kn[e.name];i||(i={},Kn[e.name]=i);let r=i[n.toURLString()];return r&&ie("Database initialized multiple times. Please make sure the format of the database URL matches with each database() call."),r=new Uu(n,dh,t,s),i[n.toURLString()]=r,r}class gh{constructor(e,t){this._repoInternal=e,this.app=t,this.type="database",this._instanceStarted=!1}get _repo(){return this._instanceStarted||(Hu(this._repoInternal,this.app.options.appId,this.app.options.databaseAuthVariableOverride),this._instanceStarted=!0),this._repoInternal}get _root(){return this._rootInternal||(this._rootInternal=new X(this._repo,w())),this._rootInternal}_delete(){return this._rootInternal!==null&&(_h(this._repo,this.app.name),this._repoInternal=null,this._rootInternal=null),Promise.resolve()}_checkNotDeleted(e){this._rootInternal===null&&ie("Cannot call "+e+" on a deleted database.")}}function yh(n=Ka(),e){const t=Va(n,"database").getImmediate({identifier:e});if(!t._instanceStarted){const s=ko("database");s&&vh(t,...s)}return t}function vh(n,e,t,s={}){n=_e(n),n._checkNotDeleted("useEmulator");const i=`${e}:${t}`,r=n._repoInternal;if(n._instanceStarted){if(i===n._repoInternal.repoInfo_.host&&Ot(s,r.repoInfo_.emulatorOptions))return;ie("connectDatabaseEmulator() cannot initialize or alter the emulator configuration after the database instance has started.")}let o;if(r.repoInfo_.nodeAdmin)s.mockUserToken&&ie('mockUserToken is not supported by the Admin SDK. For client access with mock users, please use the "firebase" package instead of "firebase-admin".'),o=new kt(kt.OWNER);else if(s.mockUserToken){const a=typeof s.mockUserToken=="string"?s.mockUserToken:Do(s.mockUserToken,n.app.options.projectId);o=new kt(a)}Xn(e)&&(Ao(e),xo("Database",!0)),fh(r,i,s,o)}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ch(n){ol(Ya),Mt(new lt("database",(e,{instanceIdentifier:t})=>{const s=e.getProvider("app").getImmediate(),i=e.getProvider("auth-internal"),r=e.getProvider("app-check-internal");return ph(s,i,r,t)},"PUBLIC").setMultipleInstances(!0)),xe(Ys,Ks,n),xe(Ys,Ks,"esm2017")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class bh{constructor(e,t){this.committed=e,this.snapshot=t}toJSON(){return{committed:this.committed,snapshot:this.snapshot.toJSON()}}}function re(n,e,t){var s;if(n=_e(n),Oe("Reference.transaction",n._path),n.key===".length"||n.key===".keys")throw"Reference.transaction failed: "+n.key+" is a read-only object.";const i=(s=void 0)!==null&&s!==void 0?s:!0,r=new G,o=(l,c,d)=>{let u=null;l?r.reject(l):(u=new je(d,new X(n._repo,n._path),A),r.resolve(new bh(c,u)))},a=fn(n,()=>{});return th(n._repo,n._path,e,o,a,i),r.promise}ne.prototype.simpleListen=function(n,e){this.sendRequest("q",{p:n},e)};ne.prototype.echo=function(n,e){this.sendRequest("echo",{d:n},e)};Ch();var Eh="firebase",wh="11.10.0";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */xe(Eh,wh,"app");const Ih={apiKey:"AIzaSyBUWOun6Fc6R58T_FAxDB217kypYi_Y59c",authDomain:"mori-no-yakai.firebaseapp.com",databaseURL:"https://mori-no-yakai-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"mori-no-yakai",storageBucket:"mori-no-yakai.firebasestorage.app",messagingSenderId:"126231981141",appId:"1:126231981141:web:b593b219aeec9f8a7078dc",measurementId:"G-TK8226P7P9"},Sh=Vi(Ih),R=yh(Sh),y={villager:{id:"villager",name:"うさぎ",emoji:"🐰",team:"forest",description:"夜は何もせず眠っています。"},werewolf:{id:"werewolf",name:"おおかみ",emoji:"🐺",team:"wolf",description:"夜、仲間のおおかみと顔を見合わせます。1匹だけなら中央カードを1枚見られます。"},seer:{id:"seer",name:"ふくろう",emoji:"🦉",team:"forest",description:"夜、他の1人のカード、または中央カード2枚のどちらかを見られます。"},robber:{id:"robber",name:"きつね",emoji:"🦊",team:"forest",description:"夜、他の1人と自分のカードを交換し、新しい役職を確認します。"},minion:{id:"minion",name:"子狼",emoji:"🐾",team:"wolf",description:"夜、おおかみが誰かを確認します（自分の正体はおおかみ側には明かされません）。"}},Th=["werewolf","minion","seer","robber"];function no(n){return{centerCount:3,werewolfCount:n<=5?1:2,seer:!0,robber:!0,minion:!0}}function Ps(n,e){const t=e.werewolfCount+(e.seer?1:0)+(e.robber?1:0)+(e.minion?1:0);return n+e.centerCount-t}function Ni(n,e){return e.werewolfCount<0?!1:Ps(n,e)>=0}function Rh(n,e){const t=Ps(n,e);if(t<0)throw new Error("役職構成が不正です（うさぎの数がマイナスになります）");const s=[];for(let i=0;i<e.werewolfCount;i++)s.push("werewolf");e.seer&&s.push("seer"),e.robber&&s.push("robber"),e.minion&&s.push("minion");for(let i=0;i<t;i++)s.push("villager");return s}function Nh(n){const e=new Set(n);return Th.filter(t=>e.has(t))}function kh(n,e=Math.random){const t=n.slice();for(let s=t.length-1;s>0;s--){const i=Math.floor(e()*(s+1));[t[s],t[i]]=[t[i],t[s]]}return t}const Ah=[15e3,3e4,45e3,6e4],Os=3e4,Dh=6e4,Ph=[3*6e4,5*6e4,8*6e4],Oh=5*6e4;function xh(n){const e={};for(const i of n)e[i.id]=0;for(const i of n)i.vote&&i.vote in e&&(e[i.vote]+=1);const t=Math.max(0,...Object.values(e)),s=t>=2?Object.entries(e).filter(([,i])=>i===t).map(([i])=>i):[];return{counts:e,eliminatedIds:s}}function Mh(n,e){const t=new Set(e);return n.some(r=>t.has(r.id)&&r.currentRole==="werewolf")||!n.some(r=>r.currentRole==="werewolf")&&(e.length===0||n.some(o=>t.has(o.id)&&o.currentRole==="minion"))?"forest":"wolf"}function Lh(n,e){const t=n.find(i=>i.id===e);if(t!=null&&t.online)return e;const s=n.filter(i=>i.online).sort((i,r)=>i.joinedAt-r.joinedAt);return s.length>0?s[0].id:e}function Fh(n,e){const t=n.filter(s=>s.online);return t.length===0?!1:t.every(s=>(s.nightReadyStep??-1)>=e)}function so(n,e){const t=n.nightStepDurationMs??Os,s=n.nightStepIndex+1;return s>=n.nightOrder.length?{...n,phase:"discuss",discussEndsAt:e+n.discussDurationMs}:{...n,nightStepIndex:s,nightStepEndsAt:e+t}}function io(n,e){return{...n,phase:"vote",voteEndsAt:e+Dh}}function $h(n,e){const t=n.filter(s=>s.online);return t.length===0?!1:t.every(s=>s.discussReadyRound===e)}function ro(n){return{...n,phase:"result"}}const ki="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";function Bh(){let n="";for(let e=0;e<5;e++)n+=ki[Math.floor(Math.random()*ki.length)];return n}function Wh(){return crypto.randomUUID()}async function oo(n,e,t){const s=T(R,`rooms/${n}/members/${e}`),i=T(R,`rooms/${n}/state`);if(!(await Se(i)).exists()){const a={phase:"lobby",hostId:e,createdAt:Date.now(),roleConfig:no(1),nightOrder:[],nightStepIndex:0,nightStepDurationMs:Os,nightStepEndsAt:0,discussDurationMs:Oh,discussEndsAt:0,voteEndsAt:0,roundNumber:0};await Ri(i,a)}if((await Se(s)).exists())await ke(s,{name:t,online:!0});else{const a={id:e,name:t,online:!0,joinedAt:Date.now()};await Ri(s,a)}to(T(R,`rooms/${n}/members/${e}/online`)).set(!1)}async function Uh(n,e){await ke(T(R,`rooms/${n}/members/${e}`),{online:!0}),to(T(R,`rooms/${n}/members/${e}/online`)).set(!1)}async function Hh(n,e){await ke(T(R,`rooms/${n}/members/${e}`),{online:!1})}function jh(n,e){return fn(T(R,`rooms/${n}/state`),t=>e(t.val()))}function Vh(n,e){return fn(T(R,`rooms/${n}/members`),t=>e(t.val()??{}))}function Gh(n,e){return fn(T(R,`rooms/${n}/centerCards`),t=>e(t.val()??[]))}async function qh(n,e){await ke(T(R,`rooms/${n}/state`),{roleConfig:e})}async function zh(n,e){await ke(T(R,`rooms/${n}/state`),{discussDurationMs:e})}function Yh(n){return no(n)}async function Kh(n){await re(T(R,`rooms/${n}`),e=>{if(!e||!e.state||e.state.phase!=="lobby")return e;const t=e.members??{},s=Object.keys(t).filter(d=>t[d].online);if(s.length<3)return e;const i=Rh(s.length,e.state.roleConfig),r=kh(i),o=r.slice(0,s.length),a=r.slice(s.length);for(const d of Object.keys(t))delete t[d].originalRole,delete t[d].currentRole,delete t[d].vote,delete t[d].nightReadyStep,delete t[d].discussReadyRound;s.forEach((d,u)=>{t[d].originalRole=o[u],t[d].currentRole=o[u]});const l=Nh(o),c=e.state.nightStepDurationMs??Os;return e.members=t,e.centerCards=a,e.state={...e.state,phase:l.length>0?"night":"discuss",nightOrder:l,nightStepIndex:0,nightStepDurationMs:c,nightStepEndsAt:Date.now()+c,discussEndsAt:Date.now()+e.state.discussDurationMs,roundNumber:(e.state.roundNumber??0)+1},e})}async function Qh(n,e){await ke(T(R,`rooms/${n}/state`),{nightStepDurationMs:e})}async function Xh(n,e,t){const s=T(R,`rooms/${n}/members/${e}/currentRole`),i=T(R,`rooms/${n}/members/${t}/currentRole`),[r,o]=await Promise.all([Se(s),Se(i)]),a=r.val(),l=o.val();return await ke(T(R,`rooms/${n}/members`),{[`${e}/currentRole`]:l,[`${t}/currentRole`]:a}),l}async function Jh(n,e,t){await re(T(R,`rooms/${n}`),s=>{var i;return!s||!s.state||s.state.phase!=="vote"||!((i=s.members)!=null&&i[e])||(s.members[e].vote=t),s})}async function Zh(n){await re(T(R,`rooms/${n}`),e=>{if(!e||!e.state)return e;const t=e.state,s=Date.now();return t.phase==="night"&&s>=t.nightStepEndsAt?e.state=so(t,s):t.phase==="discuss"&&s>=t.discussEndsAt?e.state=io(t,s):t.phase==="vote"&&s>=t.voteEndsAt&&(e.state=ro(t)),e})}async function ed(n,e,t){await re(T(R,`rooms/${n}`),s=>{var i;return!(s!=null&&s.state)||s.state.phase!=="night"||s.state.nightStepIndex!==t||!((i=s.members)!=null&&i[e])||(s.members[e].nightReadyStep=t),s}),await td(n)}async function td(n){const t=(await Se(T(R,`rooms/${n}`))).val();if(!(t!=null&&t.state)||t.state.phase!=="night")return;const s=t.members??{},i=Object.values(s).filter(r=>r.originalRole);Fh(i,t.state.nightStepIndex)&&await re(T(R,`rooms/${n}`),r=>(!(r!=null&&r.state)||r.state.phase!=="night"||r.state.nightStepIndex!==t.state.nightStepIndex||(r.state=so(r.state,Date.now())),r))}async function nd(n,e,t){await re(T(R,`rooms/${n}`),s=>{var i;return!(s!=null&&s.state)||s.state.phase!=="discuss"||s.state.roundNumber!==t||!((i=s.members)!=null&&i[e])||(s.members[e].discussReadyRound=t),s}),await sd(n)}async function sd(n){const t=(await Se(T(R,`rooms/${n}`))).val();if(!(t!=null&&t.state)||t.state.phase!=="discuss")return;const s=t.members??{},i=Object.values(s).filter(r=>r.originalRole);$h(i,t.state.roundNumber)&&await re(T(R,`rooms/${n}`),r=>(!(r!=null&&r.state)||r.state.phase!=="discuss"||r.state.roundNumber!==t.state.roundNumber||(r.state=io(r.state,Date.now())),r))}async function id(n){const t=(await Se(T(R,`rooms/${n}/members`))).val()??{},s=Object.values(t).filter(i=>i.online&&i.originalRole);s.length===0||!s.every(i=>i.vote)||await re(T(R,`rooms/${n}`),i=>(!(i!=null&&i.state)||i.state.phase!=="vote"||(i.state=ro(i.state)),i))}async function rd(n){await re(T(R,`rooms/${n}`),e=>{if(!e||!e.state)return e;const t=e.members??{};for(const s of Object.keys(t))delete t[s].originalRole,delete t[s].currentRole,delete t[s].vote,delete t[s].nightReadyStep,delete t[s].discussReadyRound;return e.members=t,e.centerCards=null,e.state={...e.state,phase:"lobby",nightOrder:[],nightStepIndex:0,nightStepEndsAt:0,voteEndsAt:0},e})}function ao(n){return Lh(Object.values(n.members),n.state.hostId)}function lo(n){return ao(n)===n.memberId}function xs(n){return Object.values(n.members).filter(e=>e.online)}function Ae(n){return Object.values(n.members).filter(e=>e.originalRole)}function od(n,e){var c,d;const t=lo(e),s=xs(e),i=e.state.roleConfig,r=e.state.discussDurationMs,o=e.state.nightStepDurationMs,a=Ps(s.length,i),l=Ni(s.length,i)&&s.length>=3;n.innerHTML=`
    <h2>🌙 森の夜会</h2>
    <button id="btn-leave-room" class="btn-link">← トップに戻る</button>
    <div class="room-code-box">
      部屋コード
      <div class="room-code">${e.roomId}</div>
    </div>

    <h3>参加者（${s.length}人）</h3>
    <ul class="member-list">
      ${s.map(u=>`<li>${ud(u.name)}${u.id===ao(e)?" 👑":""}</li>`).join("")}
    </ul>

    ${t?ld(i,a,r,o):'<p class="waiting-text">ホストの開始を待っています…</p>'}

    ${ad(i)}

    ${t?`<button id="btn-start-game" class="btn-primary" ${l?"":"disabled"}>ゲーム開始</button>
           ${s.length<3?'<p class="error-text">3人以上で開始できます</p>':""}
           ${Ni(s.length,i)?"":'<p class="error-text">役職の合計枚数が多すぎます。うさぎの数がマイナスになっています。</p>'}`:""}
  `,(c=n.querySelector("#btn-leave-room"))==null||c.addEventListener("click",()=>{e.requestLeaveRoom()}),t&&(cd(n,e,i,s.length),(d=n.querySelector("#btn-start-game"))==null||d.addEventListener("click",()=>{Kh(e.roomId)}))}function ad(n){const e=["villager","werewolf"];return n.seer&&e.push("seer"),n.robber&&e.push("robber"),n.minion&&e.push("minion"),`
    <h3>役職の説明</h3>
    <ul class="role-legend">
      ${e.map(t=>`<li>
            <strong>${y[t].emoji} ${y[t].name}</strong>
            <span class="hint-text">${y[t].description}</span>
          </li>`).join("")}
    </ul>
  `}function ld(n,e,t,s){return`
    <div class="lobby-settings">
      <h3>役職構成</h3>
      <div class="setting-row">
        <span>${y.werewolf.emoji} おおかみ</span>
        <div class="stepper">
          <button data-action="wolf-dec" class="btn-step">-</button>
          <span>${n.werewolfCount}</span>
          <button data-action="wolf-inc" class="btn-step">+</button>
        </div>
      </div>
      ${Tn("seer",n.seer)}
      ${Tn("robber",n.robber)}
      ${Tn("minion",n.minion)}
      <div class="setting-row">
        <span>🐰 うさぎ（自動）</span>
        <span class="${e<0?"error-text":""}">${e}</span>
      </div>
      <div class="setting-row">
        <span>中央カード</span>
        <div class="stepper">
          <button data-center="2" class="btn-toggle ${n.centerCount===2?"active":""}">2枚</button>
          <button data-center="3" class="btn-toggle ${n.centerCount===3?"active":""}">3枚</button>
        </div>
      </div>
      <button id="btn-reset-config" class="btn-link">人数に合わせて初期化</button>

      <h3>夜アクションの制限時間</h3>
      <p class="hint-text">短すぎると何もできず終わってしまいます。迷ったら30秒がおすすめです。</p>
      <div class="setting-row">
        ${Ah.map(i=>`<button data-night-step="${i}" class="btn-toggle ${i===s?"active":""}">${i/1e3}秒</button>`).join("")}
      </div>

      <h3>議論タイマー</h3>
      <div class="setting-row">
        ${Ph.map(i=>`<button data-discuss="${i}" class="btn-toggle ${i===t?"active":""}">${i/6e4}分</button>`).join("")}
      </div>
    </div>
  `}function Tn(n,e){const t=y[n];return`
    <div class="setting-row">
      <span>${t.emoji} ${t.name}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-role-toggle="${n}" ${e?"checked":""} />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `}function cd(n,e,t,s){var r,o,a;const i=l=>void qh(e.roomId,l);(r=n.querySelector('[data-action="wolf-inc"]'))==null||r.addEventListener("click",()=>{i({...t,werewolfCount:t.werewolfCount+1})}),(o=n.querySelector('[data-action="wolf-dec"]'))==null||o.addEventListener("click",()=>{i({...t,werewolfCount:Math.max(0,t.werewolfCount-1)})}),["seer","robber","minion"].forEach(l=>{var c;(c=n.querySelector(`[data-role-toggle="${l}"]`))==null||c.addEventListener("change",d=>{const u=d.target.checked;i({...t,[l]:u})})}),n.querySelectorAll("[data-center]").forEach(l=>{l.addEventListener("click",()=>{const c=Number(l.dataset.center);i({...t,centerCount:c})})}),n.querySelectorAll("[data-night-step]").forEach(l=>{l.addEventListener("click",()=>{const c=Number(l.dataset.nightStep);Qh(e.roomId,c)})}),n.querySelectorAll("[data-discuss]").forEach(l=>{l.addEventListener("click",()=>{const c=Number(l.dataset.discuss);zh(e.roomId,c)})}),(a=n.querySelector("#btn-reset-config"))==null||a.addEventListener("click",()=>{i(Yh(s))})}function ud(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}let g={step:-1,round:-1};function ee(n,e){var _;const t=e.state.nightStepIndex,s=e.state.roundNumber;(g.step!==t||g.round!==s)&&(g={step:t,round:s}),!g.centerCardsSnapshot&&e.centerCards.length>0&&(g.centerCardsSnapshot=e.centerCards);const i=e.state.nightOrder[t],r=e.members[e.memberId],o=Math.max(0,Math.ceil((e.state.nightStepEndsAt-Date.now())/1e3)),a=(r==null?void 0:r.originalRole)===i,l=g.readyTapped||((r==null?void 0:r.nightReadyStep)??-1)>=t,c=l||g.robberPending===!0,d=`
    <h2>🌙 夜がふけていく…</h2>
    <div class="night-timer">${o}秒</div>
  `,u=a?l?hd(i,e):dd(i,e):`
      <p class="waiting-text">${y[i].emoji} だれかが行動中…しずかに待とう</p>
      <p class="role-description">${y[i].name}：${y[i].description}</p>
    `,h=xs(e).filter(E=>E.originalRole),p=h.filter(E=>(E.nightReadyStep??-1)>=t).length;n.innerHTML=`
    ${d}
    ${u}
    <button id="btn-night-ready" class="btn-primary" ${c?"disabled":""}>
      ${l?"つぎを待っています…":g.robberPending?"交換中…":"つぎへ"}
    </button>
    <p class="hint-text">準備完了 ${p}/${h.length}人</p>
    <p class="hint-text">全員がタップすると次に進みます（役職と関係なく全員タップしてください）</p>
  `,a&&!l&&fd(n,i,e),(_=n.querySelector("#btn-night-ready"))==null||_.addEventListener("click",()=>{g.readyTapped||g.robberPending||(g.readyTapped=!0,ee(n,e),ed(e.roomId,e.memberId,t))})}function hd(n,e){switch(n){case"werewolf":return Ae(e).filter(s=>s.originalRole==="werewolf").length>=2||g.wolfPeekIndex!==void 0?co(e):`<p>${y.werewolf.emoji} 中央カードは見ませんでした。</p>`;case"minion":return uo(e);case"seer":return g.seerChoice?ho(e):`<p>${y.seer.emoji} 何も見ませんでした。</p>`;case"robber":return g.robberResult?fo(e):`<p>${y.robber.emoji} 誰とも交換しませんでした。</p>`;case"villager":return"<p>あなたはうさぎ。することはありません。</p>"}}function dd(n,e){switch(n){case"werewolf":return co(e);case"minion":return uo(e);case"seer":return ho(e);case"robber":return fo(e);case"villager":return`
        <p>${y.villager.emoji} あなたはうさぎ。することはありません。</p>
        <p class="role-description">${y.villager.description}</p>
      `}}function co(n){const e=Ae(n).filter(r=>r.originalRole==="werewolf"),t=e.filter(r=>r.id!==n.memberId),s=`<p class="role-description">${y.werewolf.description}</p>`;if(e.length>=2)return`
      <p>${y.werewolf.emoji} あなたはおおかみ。仲間は…</p>
      <ul class="member-list">${t.map(r=>`<li>${gt(r.name)}</li>`).join("")}</ul>
      ${s}
    `;const i=g.centerCardsSnapshot??n.centerCards;if(g.wolfPeekIndex!==void 0){const r=i[g.wolfPeekIndex];return`
      <p>${y.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
      <p>中央カード${g.wolfPeekIndex+1}は ${y[r].emoji} ${y[r].name}</p>
      ${s}
    `}return i.length===0?`
      <p>${y.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
      <p class="hint-text">中央カードを読み込み中…</p>
      ${s}
    `:`
    <p>${y.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
    <p>中央カードを1枚だけ見られます。</p>
    <div class="center-card-row">
      ${i.map((r,o)=>`<button data-center-peek="${o}" class="btn-card">中央${o+1}</button>`).join("")}
    </div>
    ${s}
  `}function uo(n){const e=Ae(n).filter(t=>t.originalRole==="werewolf");return`
    <p>${y.minion.emoji} あなたは子狼。おおかみ陣営の仲間は…</p>
    ${e.length>0?`<ul class="member-list">${e.map(t=>`<li>${gt(t.name)}</li>`).join("")}</ul>`:"<p>場にはおおかみがいません。あなただけがおおかみ陣営です。</p>"}
    <p class="role-description">${y.minion.description}</p>
  `}function ho(n){const e=`<p class="role-description">${y.seer.description}</p>`,t=g.centerCardsSnapshot??n.centerCards;if(g.seerChoice==="player"&&g.seerTargetId){const r=n.members[g.seerTargetId];return`<p>${gt(r.name)}の役職は ${y[r.currentRole].emoji} ${y[r.currentRole].name}</p>${e}`}if(g.seerChoice==="center")return`<p>中央カードは ${t.map((o,a)=>a).slice(0,2).map(o=>`${y[t[o]].emoji} ${y[t[o]].name}`).join(" と ")}</p>${e}`;if(g.seerChoice==="skip")return`<p>何も見ませんでした。</p>${e}`;const s=Ae(n).filter(r=>r.id!==n.memberId),i=t.length>0?'<button data-seer-center class="btn-card">中央2枚を見る</button>':'<span class="hint-text">中央カードを読み込み中…</span>';return`
    <p>${y.seer.emoji} あなたはふくろう。何を見ますか？</p>
    <p class="hint-text">他の1人 か 中央カード2枚、どちらか片方だけ見られます。</p>
    <div class="member-list">
      ${s.map(r=>`<button data-seer-player="${r.id}" class="btn-card">${gt(r.name)}</button>`).join("")}
    </div>
    <div class="center-card-row">
      ${i}
    </div>
    <button data-seer-skip class="btn-link">何も見ない</button>
    ${e}
  `}function fo(n){const e=`<p class="role-description">${y.robber.description}</p>`;if(g.robberResult)return`<p>${y.robber.emoji} 交換後、あなたの役職は ${y[g.robberResult].emoji} ${y[g.robberResult].name}</p>${e}`;if(g.robberPending)return`<p>${y.robber.emoji} 交換中…</p>${e}`;const t=Ae(n).filter(s=>s.id!==n.memberId);return`
    <p>${y.robber.emoji} あなたはきつね。誰かと役職を交換しますか？</p>
    <div class="member-list">
      ${t.map(s=>`<button data-robber-target="${s.id}" class="btn-card">${gt(s.name)}</button>`).join("")}
    </div>
    <button data-robber-skip class="btn-link">だれとも交換しない</button>
    ${e}
  `}function fd(n,e,t){var s,i,r;e==="werewolf"&&n.querySelectorAll("[data-center-peek]").forEach(o=>{o.addEventListener("click",()=>{g.wolfPeekIndex===void 0&&(g.wolfPeekIndex=Number(o.dataset.centerPeek),ee(n,t))})}),e==="seer"&&(n.querySelectorAll("[data-seer-player]").forEach(o=>{o.addEventListener("click",()=>{g.seerChoice||(g.seerChoice="player",g.seerTargetId=o.dataset.seerPlayer,ee(n,t))})}),(s=n.querySelector("[data-seer-center]"))==null||s.addEventListener("click",()=>{g.seerChoice||(g.seerChoice="center",ee(n,t))}),(i=n.querySelector("[data-seer-skip]"))==null||i.addEventListener("click",()=>{g.seerChoice||(g.seerChoice="skip",ee(n,t))})),e==="robber"&&(n.querySelectorAll("[data-robber-target]").forEach(o=>{o.addEventListener("click",()=>{if(g.robberPending||g.robberResult)return;g.robberPending=!0;const a=o.dataset.robberTarget;ee(n,t),Xh(t.roomId,t.memberId,a).then(l=>{g.robberPending=!1,g.robberResult=l,ee(n,t)})})}),(r=n.querySelector("[data-robber-skip]"))==null||r.addEventListener("click",()=>{g.robberPending||g.robberResult||(g.robberResult=t.members[t.memberId].currentRole,ee(n,t))}))}function gt(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}let Ze={round:-1};function po(n,e){var u;const t=e.state.roundNumber;Ze.round!==t&&(Ze={round:t});const s=e.members[e.memberId],i=Math.max(0,Math.ceil((e.state.discussEndsAt-Date.now())/1e3)),r=Math.floor(i/60),o=i%60,a=s==null?void 0:s.currentRole,l=Ze.readyTapped||(s==null?void 0:s.discussReadyRound)===t,c=xs(e).filter(h=>h.originalRole),d=c.filter(h=>h.discussReadyRound===t).length;n.innerHTML=`
    <h2>🗣️ 議論タイム</h2>
    <div class="discuss-timer">${r}:${String(o).padStart(2,"0")}</div>
    ${a?`<p class="role-reminder">あなたの最終的な役職は ${y[a].emoji} ${y[a].name}</p>
           <p class="role-description">${y[a].description}</p>`:""}
    <p class="hint-text">声に出して話し合おう。うそをついてもOK！</p>
    <button id="btn-discuss-ready" class="btn-primary" ${l?"disabled":""}>
      ${l?"投票を待っています…":"話し合いおわり・投票へ"}
    </button>
    <p class="hint-text">準備完了 ${d}/${c.length}人</p>
  `,(u=n.querySelector("#btn-discuss-ready"))==null||u.addEventListener("click",()=>{Ze.readyTapped||(Ze.readyTapped=!0,po(n,e),nd(e.roomId,e.memberId,t))})}function pd(n,e){const t=e.members[e.memberId],s=Ae(e),i=s.filter(l=>l.id!==e.memberId),r=Math.max(0,Math.ceil((e.state.voteEndsAt-Date.now())/1e3)),o=s.filter(l=>l.vote).length;if(!(t!=null&&t.originalRole)){n.innerHTML=`
      <h2>🗳️ 投票</h2>
      <p class="waiting-text">このゲームには参加していません。結果を待ちましょう。</p>
    `;return}const a=t.currentRole;n.innerHTML=`
    <h2>🗳️ 投票</h2>
    <div class="vote-timer">${r}秒</div>
    <p class="role-reminder">あなたの役職は ${y[a].emoji} ${y[a].name}</p>
    <p class="hint-text">あやしいと思う相手に1人投票しよう（${o}/${s.length}人 投票済み）</p>
    <p class="hint-text">誰も2票以上を集めなければ、誰も脱落しません。</p>
    <div class="member-list vote-list">
      ${i.map(l=>`<button data-vote-target="${l.id}" class="btn-card ${(t==null?void 0:t.vote)===l.id?"active":""}">${_d(l.name)}${l.online?"":"（切断中）"}</button>`).join("")}
    </div>

    <h3>勝利条件</h3>
    <ul class="role-legend">
      <li>
        <strong>🌳 森陣営（うさぎ・ふくろう・きつね）</strong>
        <span class="hint-text">おおかみを1人でも脱落させれば勝利。または、場におおかみが1匹もいない状態で誰も脱落しなければ勝利。</span>
      </li>
      <li>
        <strong>🐺 おおかみ陣営（おおかみ・子狼）</strong>
        <span class="hint-text">おおかみが1人も脱落しなければ勝利。</span>
      </li>
    </ul>
  `,n.querySelectorAll("[data-vote-target]").forEach(l=>{l.addEventListener("click",async()=>{const c=l.dataset.voteTarget;await Jh(e.roomId,e.memberId,c),await id(e.roomId)})})}function _d(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}function md(n,e){var a;const t=Ae(e),{counts:s,eliminatedIds:i}=xh(t),r=Mh(t,i),o=new Set(i);n.innerHTML=`
    <h2>${r==="forest"?"🌳 森陣営の勝利！":"🐺 おおかみ陣営の勝利！"}</h2>
    <p class="hint-text">${i.length>0?`脱落したのは ${i.map(l=>{var c;return Ai(((c=e.members[l])==null?void 0:c.name)??"?")}).join("、")}`:"誰も脱落しませんでした"}</p>

    <h3>みんなの最終役職</h3>
    <ul class="member-list result-list">
      ${t.map(l=>{const c=l.currentRole,d=c?y[c]:void 0;return`<li class="${o.has(l.id)?"eliminated":""}">
            ${Ai(l.name)}
            — ${d?`${d.emoji} ${d.name}`:"?"}
            <span class="vote-count">(${s[l.id]??0}票)</span>
          </li>`}).join("")}
    </ul>

    ${lo(e)?'<button id="btn-play-again" class="btn-primary">もう一度あそぶ</button>':""}
  `,(a=n.querySelector("#btn-play-again"))==null||a.addEventListener("click",()=>{rd(e.roomId)})}function Ai(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}const Kt="mori-no-yakai-session";async function gd(){try{if((await(await fetch("version.json?t="+Date.now())).json()).version!=="0.1.8"){const t=await caches.keys();await Promise.all(t.map(i=>caches.delete(i)));const s=await navigator.serviceWorker.getRegistration();s&&await s.unregister(),window.location.reload()}}catch{}}let H=null,K=null,ve=null,Qt={},Ms=[],ot=[],At=null;function _o(){return{home:document.getElementById("screen-home"),lobby:document.getElementById("screen-lobby"),night:document.getElementById("screen-night"),discuss:document.getElementById("screen-discuss"),vote:document.getElementById("screen-vote"),result:document.getElementById("screen-result")}}function mo(n){const e=_o();for(const t of Object.keys(e))e[t].classList.toggle("active",t===n)}async function Di(n,e){const t=document.getElementById("home-error");if(t.textContent="",!e.trim()){t.textContent="なまえを入力してください";return}const s=Wh();try{await oo(n,s,e.trim())}catch{t.textContent="入室に失敗しました。部屋コードを確認してください。";return}H=n,K=s,localStorage.setItem(Kt,JSON.stringify({roomId:n,memberId:s,name:e.trim()})),yo()}function go(){ot.forEach(n=>n()),ot=[],At!==null&&(clearInterval(At),At=null)}function yo(){if(!H||!K)return;const n=H;go(),ot.push(jh(n,e=>{ve=e,Nt()})),ot.push(Vh(n,e=>{Qt=e,Nt()})),ot.push(Gh(n,e=>{Ms=e,Nt()})),At=setInterval(()=>{H&&Zh(H),Nt()},1e3)}function Rn(){H&&K&&Uh(H,K)}function yd(){H&&K&&Hh(H,K),go(),H=null,K=null,ve=null,Qt={},Ms=[],localStorage.removeItem(Kt),mo("home")}function Nt(){if(!ve||!H||!K||!Qt[K])return;const n={roomId:H,memberId:K,state:ve,members:Qt,centerCards:Ms,requestLeaveRoom:yd};mo(ve.phase);const e=_o()[ve.phase];switch(ve.phase){case"lobby":od(e,n);break;case"night":ee(e,n);break;case"discuss":po(e,n);break;case"vote":pd(e,n);break;case"result":md(e,n);break}}function vd(){var e,t;(e=document.getElementById("btn-create-room"))==null||e.addEventListener("click",()=>{const s=document.getElementById("input-name").value;Di(Bh(),s)}),(t=document.getElementById("btn-join-room"))==null||t.addEventListener("click",()=>{const s=document.getElementById("input-name").value,i=document.getElementById("input-room-code").value.trim().toUpperCase();if(!i){document.getElementById("home-error").textContent="部屋コードを入力してください";return}Di(i,s)}),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&Rn()}),window.addEventListener("pageshow",Rn),window.addEventListener("online",Rn);const n=localStorage.getItem(Kt);if(n)try{const s=JSON.parse(n);document.getElementById("input-name").value=s.name??"",s.roomId&&s.memberId&&(H=s.roomId,K=s.memberId,oo(s.roomId,s.memberId,s.name).then(()=>{yo()}))}catch{localStorage.removeItem(Kt)}}vd();gd();
