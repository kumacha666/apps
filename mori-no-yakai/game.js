(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(i){if(i.ep)return;i.ep=!0;const r=t(i);fetch(i.href,r)}})();const Mo=()=>{};var Gs={};/**
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
 */const ji={NODE_ADMIN:!1,SDK_VERSION:"${JSCORE_VERSION}"};/**
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
 */const f=function(n,e){if(!n)throw Ye(e)},Ye=function(n){return new Error("Firebase Database ("+ji.SDK_VERSION+") INTERNAL ASSERT FAILED: "+n)};/**
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
 */const Vi=function(n){const e=[];let t=0;for(let s=0;s<n.length;s++){let i=n.charCodeAt(s);i<128?e[t++]=i:i<2048?(e[t++]=i>>6|192,e[t++]=i&63|128):(i&64512)===55296&&s+1<n.length&&(n.charCodeAt(s+1)&64512)===56320?(i=65536+((i&1023)<<10)+(n.charCodeAt(++s)&1023),e[t++]=i>>18|240,e[t++]=i>>12&63|128,e[t++]=i>>6&63|128,e[t++]=i&63|128):(e[t++]=i>>12|224,e[t++]=i>>6&63|128,e[t++]=i&63|128)}return e},xo=function(n){const e=[];let t=0,s=0;for(;t<n.length;){const i=n[t++];if(i<128)e[s++]=String.fromCharCode(i);else if(i>191&&i<224){const r=n[t++];e[s++]=String.fromCharCode((i&31)<<6|r&63)}else if(i>239&&i<365){const r=n[t++],o=n[t++],a=n[t++],l=((i&7)<<18|(r&63)<<12|(o&63)<<6|a&63)-65536;e[s++]=String.fromCharCode(55296+(l>>10)),e[s++]=String.fromCharCode(56320+(l&1023))}else{const r=n[t++],o=n[t++];e[s++]=String.fromCharCode((i&15)<<12|(r&63)<<6|o&63)}}return e.join("")},rs={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(n,e){if(!Array.isArray(n))throw Error("encodeByteArray takes an array as a parameter");this.init_();const t=e?this.byteToCharMapWebSafe_:this.byteToCharMap_,s=[];for(let i=0;i<n.length;i+=3){const r=n[i],o=i+1<n.length,a=o?n[i+1]:0,l=i+2<n.length,c=l?n[i+2]:0,d=r>>2,u=(r&3)<<4|a>>4;let h=(a&15)<<2|c>>6,p=c&63;l||(p=64,o||(h=64)),s.push(t[d],t[u],t[h],t[p])}return s.join("")},encodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?btoa(n):this.encodeByteArray(Vi(n),e)},decodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?atob(n):xo(this.decodeStringToByteArray(n,e))},decodeStringToByteArray(n,e){this.init_();const t=e?this.charToByteMapWebSafe_:this.charToByteMap_,s=[];for(let i=0;i<n.length;){const r=t[n.charAt(i++)],a=i<n.length?t[n.charAt(i)]:0;++i;const c=i<n.length?t[n.charAt(i)]:64;++i;const u=i<n.length?t[n.charAt(i)]:64;if(++i,r==null||a==null||c==null||u==null)throw new Lo;const h=r<<2|a>>4;if(s.push(h),c!==64){const p=a<<4&240|c>>2;if(s.push(p),u!==64){const _=c<<6&192|u;s.push(_)}}}return s},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let n=0;n<this.ENCODED_VALS.length;n++)this.byteToCharMap_[n]=this.ENCODED_VALS.charAt(n),this.charToByteMap_[this.byteToCharMap_[n]]=n,this.byteToCharMapWebSafe_[n]=this.ENCODED_VALS_WEBSAFE.charAt(n),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[n]]=n,n>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(n)]=n,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(n)]=n)}}};class Lo extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const qi=function(n){const e=Vi(n);return rs.encodeByteArray(e,!0)},Lt=function(n){return qi(n).replace(/\./g,"")},Ln=function(n){try{return rs.decodeString(n,!0)}catch(e){console.error("base64Decode failed: ",e)}return null};/**
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
 */function Fo(n){return Gi(void 0,n)}function Gi(n,e){if(!(e instanceof Object))return e;switch(e.constructor){case Date:const t=e;return new Date(t.getTime());case Object:n===void 0&&(n={});break;case Array:n=[];break;default:return e}for(const t in e)!e.hasOwnProperty(t)||!$o(t)||(n[t]=Gi(n[t],e[t]));return n}function $o(n){return n!=="__proto__"}/**
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
 */function Bo(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
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
 */const Wo=()=>Bo().__FIREBASE_DEFAULTS__,Ho=()=>{if(typeof process>"u"||typeof Gs>"u")return;const n=Gs.__FIREBASE_DEFAULTS__;if(n)return JSON.parse(n)},Uo=()=>{if(typeof document>"u")return;let n;try{n=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const e=n&&Ln(n[1]);return e&&JSON.parse(e)},zi=()=>{try{return Mo()||Wo()||Ho()||Uo()}catch(n){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${n}`);return}},jo=n=>{var e,t;return(t=(e=zi())===null||e===void 0?void 0:e.emulatorHosts)===null||t===void 0?void 0:t[n]},Vo=n=>{const e=jo(n);if(!e)return;const t=e.lastIndexOf(":");if(t<=0||t+1===e.length)throw new Error(`Invalid host ${e} with no separate hostname and port!`);const s=parseInt(e.substring(t+1),10);return e[0]==="["?[e.substring(1,t-1),s]:[e.substring(0,t),s]},Yi=()=>{var n;return(n=zi())===null||n===void 0?void 0:n.config};/**
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
 */class K{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((e,t)=>{this.resolve=e,this.reject=t})}wrapCallback(e){return(t,s)=>{t?this.reject(t):this.resolve(s),typeof e=="function"&&(this.promise.catch(()=>{}),e.length===1?e(t):e(t,s))}}}/**
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
 */function os(n){try{return(n.startsWith("http://")||n.startsWith("https://")?new URL(n).hostname:n).endsWith(".cloudworkstations.dev")}catch{return!1}}async function qo(n){return(await fetch(n,{credentials:"include"})).ok}/**
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
 */function Go(n,e){if(n.uid)throw new Error('The "uid" field is no longer supported by mockUserToken. Please use "sub" instead for Firebase Auth User ID.');const t={alg:"none",type:"JWT"},s=e||"demo-project",i=n.iat||0,r=n.sub||n.user_id;if(!r)throw new Error("mockUserToken must contain 'sub' or 'user_id' field!");const o=Object.assign({iss:`https://securetoken.google.com/${s}`,aud:s,iat:i,exp:i+3600,auth_time:i,sub:r,user_id:r,firebase:{sign_in_provider:"custom",identities:{}}},n);return[Lt(JSON.stringify(t)),Lt(JSON.stringify(o)),""].join(".")}const st={};function zo(){const n={prod:[],emulator:[]};for(const e of Object.keys(st))st[e]?n.emulator.push(e):n.prod.push(e);return n}function Yo(n){let e=document.getElementById(n),t=!1;return e||(e=document.createElement("div"),e.setAttribute("id",n),t=!0),{created:t,element:e}}let zs=!1;function Ko(n,e){if(typeof window>"u"||typeof document>"u"||!os(window.location.host)||st[n]===e||st[n]||zs)return;st[n]=e;function t(h){return`__firebase__banner__${h}`}const s="__firebase__banner",r=zo().prod.length>0;function o(){const h=document.getElementById(s);h&&h.remove()}function a(h){h.style.display="flex",h.style.background="#7faaf0",h.style.position="fixed",h.style.bottom="5px",h.style.left="5px",h.style.padding=".5em",h.style.borderRadius="5px",h.style.alignItems="center"}function l(h,p){h.setAttribute("width","24"),h.setAttribute("id",p),h.setAttribute("height","24"),h.setAttribute("viewBox","0 0 24 24"),h.setAttribute("fill","none"),h.style.marginLeft="-6px"}function c(){const h=document.createElement("span");return h.style.cursor="pointer",h.style.marginLeft="16px",h.style.fontSize="24px",h.innerHTML=" &times;",h.onclick=()=>{zs=!0,o()},h}function d(h,p){h.setAttribute("id",p),h.innerText="Learn more",h.href="https://firebase.google.com/docs/studio/preview-apps#preview-backend",h.setAttribute("target","__blank"),h.style.paddingLeft="5px",h.style.textDecoration="underline"}function u(){const h=Yo(s),p=t("text"),_=document.getElementById(p)||document.createElement("span"),w=t("learnmore"),P=document.getElementById(w)||document.createElement("a"),z=t("preprendIcon"),te=document.getElementById(z)||document.createElementNS("http://www.w3.org/2000/svg","svg");if(h.created){const be=h.element;a(be),d(P,w);const Cn=c();l(te,z),be.append(te,_,P,Cn),document.body.appendChild(be)}r?(_.innerText="Preview backend disconnected.",te.innerHTML=`<g clip-path="url(#clip0_6013_33858)">
<path d="M4.8 17.6L12 5.6L19.2 17.6H4.8ZM6.91667 16.4H17.0833L12 7.93333L6.91667 16.4ZM12 15.6C12.1667 15.6 12.3056 15.5444 12.4167 15.4333C12.5389 15.3111 12.6 15.1667 12.6 15C12.6 14.8333 12.5389 14.6944 12.4167 14.5833C12.3056 14.4611 12.1667 14.4 12 14.4C11.8333 14.4 11.6889 14.4611 11.5667 14.5833C11.4556 14.6944 11.4 14.8333 11.4 15C11.4 15.1667 11.4556 15.3111 11.5667 15.4333C11.6889 15.5444 11.8333 15.6 12 15.6ZM11.4 13.6H12.6V10.4H11.4V13.6Z" fill="#212121"/>
</g>
<defs>
<clipPath id="clip0_6013_33858">
<rect width="24" height="24" fill="white"/>
</clipPath>
</defs>`):(te.innerHTML=`<g clip-path="url(#clip0_6083_34804)">
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
 */function Qo(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function Ki(){return typeof window<"u"&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(Qo())}function Xo(){return typeof navigator=="object"&&navigator.product==="ReactNative"}function Jo(){return ji.NODE_ADMIN===!0}function Zo(){try{return typeof indexedDB=="object"}catch{return!1}}function ea(){return new Promise((n,e)=>{try{let t=!0;const s="validate-browser-context-for-indexeddb-analytics-module",i=self.indexedDB.open(s);i.onsuccess=()=>{i.result.close(),t||self.indexedDB.deleteDatabase(s),n(!0)},i.onupgradeneeded=()=>{t=!1},i.onerror=()=>{var r;e(((r=i.error)===null||r===void 0?void 0:r.message)||"")}}catch(t){e(t)}})}/**
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
 */const ta="FirebaseError";class wt extends Error{constructor(e,t,s){super(t),this.code=e,this.customData=s,this.name=ta,Object.setPrototypeOf(this,wt.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,Qi.prototype.create)}}class Qi{constructor(e,t,s){this.service=e,this.serviceName=t,this.errors=s}create(e,...t){const s=t[0]||{},i=`${this.service}/${e}`,r=this.errors[e],o=r?na(r,s):"Error",a=`${this.serviceName}: ${o} (${i}).`;return new wt(i,a,s)}}function na(n,e){return n.replace(sa,(t,s)=>{const i=e[s];return i!=null?String(i):`<${s}?>`})}const sa=/\{\$([^}]+)}/g;/**
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
 */function ht(n){return JSON.parse(n)}function L(n){return JSON.stringify(n)}/**
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
 */const Xi=function(n){let e={},t={},s={},i="";try{const r=n.split(".");e=ht(Ln(r[0])||""),t=ht(Ln(r[1])||""),i=r[2],s=t.d||{},delete t.d}catch{}return{header:e,claims:t,data:s,signature:i}},ia=function(n){const e=Xi(n),t=e.claims;return!!t&&typeof t=="object"&&t.hasOwnProperty("iat")},ra=function(n){const e=Xi(n).claims;return typeof e=="object"&&e.admin===!0};/**
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
 */function Z(n,e){return Object.prototype.hasOwnProperty.call(n,e)}function Se(n,e){if(Object.prototype.hasOwnProperty.call(n,e))return n[e]}function Fn(n){for(const e in n)if(Object.prototype.hasOwnProperty.call(n,e))return!1;return!0}function Ft(n,e,t){const s={};for(const i in n)Object.prototype.hasOwnProperty.call(n,i)&&(s[i]=e.call(t,n[i],i,n));return s}function $t(n,e){if(n===e)return!0;const t=Object.keys(n),s=Object.keys(e);for(const i of t){if(!s.includes(i))return!1;const r=n[i],o=e[i];if(Ys(r)&&Ys(o)){if(!$t(r,o))return!1}else if(r!==o)return!1}for(const i of s)if(!t.includes(i))return!1;return!0}function Ys(n){return n!==null&&typeof n=="object"}/**
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
 */function oa(n){const e=[];for(const[t,s]of Object.entries(n))Array.isArray(s)?s.forEach(i=>{e.push(encodeURIComponent(t)+"="+encodeURIComponent(i))}):e.push(encodeURIComponent(t)+"="+encodeURIComponent(s));return e.length?"&"+e.join("&"):""}/**
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
 */class aa{constructor(){this.chain_=[],this.buf_=[],this.W_=[],this.pad_=[],this.inbuf_=0,this.total_=0,this.blockSize=512/8,this.pad_[0]=128;for(let e=1;e<this.blockSize;++e)this.pad_[e]=0;this.reset()}reset(){this.chain_[0]=1732584193,this.chain_[1]=4023233417,this.chain_[2]=2562383102,this.chain_[3]=271733878,this.chain_[4]=3285377520,this.inbuf_=0,this.total_=0}compress_(e,t){t||(t=0);const s=this.W_;if(typeof e=="string")for(let u=0;u<16;u++)s[u]=e.charCodeAt(t)<<24|e.charCodeAt(t+1)<<16|e.charCodeAt(t+2)<<8|e.charCodeAt(t+3),t+=4;else for(let u=0;u<16;u++)s[u]=e[t]<<24|e[t+1]<<16|e[t+2]<<8|e[t+3],t+=4;for(let u=16;u<80;u++){const h=s[u-3]^s[u-8]^s[u-14]^s[u-16];s[u]=(h<<1|h>>>31)&4294967295}let i=this.chain_[0],r=this.chain_[1],o=this.chain_[2],a=this.chain_[3],l=this.chain_[4],c,d;for(let u=0;u<80;u++){u<40?u<20?(c=a^r&(o^a),d=1518500249):(c=r^o^a,d=1859775393):u<60?(c=r&o|a&(r|o),d=2400959708):(c=r^o^a,d=3395469782);const h=(i<<5|i>>>27)+c+l+d+s[u]&4294967295;l=a,a=o,o=(r<<30|r>>>2)&4294967295,r=i,i=h}this.chain_[0]=this.chain_[0]+i&4294967295,this.chain_[1]=this.chain_[1]+r&4294967295,this.chain_[2]=this.chain_[2]+o&4294967295,this.chain_[3]=this.chain_[3]+a&4294967295,this.chain_[4]=this.chain_[4]+l&4294967295}update(e,t){if(e==null)return;t===void 0&&(t=e.length);const s=t-this.blockSize;let i=0;const r=this.buf_;let o=this.inbuf_;for(;i<t;){if(o===0)for(;i<=s;)this.compress_(e,i),i+=this.blockSize;if(typeof e=="string"){for(;i<t;)if(r[o]=e.charCodeAt(i),++o,++i,o===this.blockSize){this.compress_(r),o=0;break}}else for(;i<t;)if(r[o]=e[i],++o,++i,o===this.blockSize){this.compress_(r),o=0;break}}this.inbuf_=o,this.total_+=t}digest(){const e=[];let t=this.total_*8;this.inbuf_<56?this.update(this.pad_,56-this.inbuf_):this.update(this.pad_,this.blockSize-(this.inbuf_-56));for(let i=this.blockSize-1;i>=56;i--)this.buf_[i]=t&255,t/=256;this.compress_(this.buf_);let s=0;for(let i=0;i<5;i++)for(let r=24;r>=0;r-=8)e[s]=this.chain_[i]>>r&255,++s;return e}}function He(n,e){return`${n} failed: ${e} argument `}/**
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
 */const la=function(n){const e=[];let t=0;for(let s=0;s<n.length;s++){let i=n.charCodeAt(s);if(i>=55296&&i<=56319){const r=i-55296;s++,f(s<n.length,"Surrogate pair missing trail surrogate.");const o=n.charCodeAt(s)-56320;i=65536+(r<<10)+o}i<128?e[t++]=i:i<2048?(e[t++]=i>>6|192,e[t++]=i&63|128):i<65536?(e[t++]=i>>12|224,e[t++]=i>>6&63|128,e[t++]=i&63|128):(e[t++]=i>>18|240,e[t++]=i>>12&63|128,e[t++]=i>>6&63|128,e[t++]=i&63|128)}return e},sn=function(n){let e=0;for(let t=0;t<n.length;t++){const s=n.charCodeAt(t);s<128?e++:s<2048?e+=2:s>=55296&&s<=56319?(e+=4,t++):e+=3}return e};/**
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
 */function ve(n){return n&&n._delegate?n._delegate:n}class dt{constructor(e,t,s){this.name=e,this.instanceFactory=t,this.type=s,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(e){return this.instantiationMode=e,this}setMultipleInstances(e){return this.multipleInstances=e,this}setServiceProps(e){return this.serviceProps=e,this}setInstanceCreatedCallback(e){return this.onInstanceCreated=e,this}}/**
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
 */const we="[DEFAULT]";/**
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
 */class ca{constructor(e,t){this.name=e,this.container=t,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(e){const t=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(t)){const s=new K;if(this.instancesDeferred.set(t,s),this.isInitialized(t)||this.shouldAutoInitialize())try{const i=this.getOrInitializeService({instanceIdentifier:t});i&&s.resolve(i)}catch{}}return this.instancesDeferred.get(t).promise}getImmediate(e){var t;const s=this.normalizeInstanceIdentifier(e==null?void 0:e.identifier),i=(t=e==null?void 0:e.optional)!==null&&t!==void 0?t:!1;if(this.isInitialized(s)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:s})}catch(r){if(i)return null;throw r}else{if(i)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(e){if(e.name!==this.name)throw Error(`Mismatching Component ${e.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=e,!!this.shouldAutoInitialize()){if(ha(e))try{this.getOrInitializeService({instanceIdentifier:we})}catch{}for(const[t,s]of this.instancesDeferred.entries()){const i=this.normalizeInstanceIdentifier(t);try{const r=this.getOrInitializeService({instanceIdentifier:i});s.resolve(r)}catch{}}}}clearInstance(e=we){this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}async delete(){const e=Array.from(this.instances.values());await Promise.all([...e.filter(t=>"INTERNAL"in t).map(t=>t.INTERNAL.delete()),...e.filter(t=>"_delete"in t).map(t=>t._delete())])}isComponentSet(){return this.component!=null}isInitialized(e=we){return this.instances.has(e)}getOptions(e=we){return this.instancesOptions.get(e)||{}}initialize(e={}){const{options:t={}}=e,s=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(s))throw Error(`${this.name}(${s}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const i=this.getOrInitializeService({instanceIdentifier:s,options:t});for(const[r,o]of this.instancesDeferred.entries()){const a=this.normalizeInstanceIdentifier(r);s===a&&o.resolve(i)}return i}onInit(e,t){var s;const i=this.normalizeInstanceIdentifier(t),r=(s=this.onInitCallbacks.get(i))!==null&&s!==void 0?s:new Set;r.add(e),this.onInitCallbacks.set(i,r);const o=this.instances.get(i);return o&&e(o,i),()=>{r.delete(e)}}invokeOnInitCallbacks(e,t){const s=this.onInitCallbacks.get(t);if(s)for(const i of s)try{i(e,t)}catch{}}getOrInitializeService({instanceIdentifier:e,options:t={}}){let s=this.instances.get(e);if(!s&&this.component&&(s=this.component.instanceFactory(this.container,{instanceIdentifier:ua(e),options:t}),this.instances.set(e,s),this.instancesOptions.set(e,t),this.invokeOnInitCallbacks(s,e),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,e,s)}catch{}return s||null}normalizeInstanceIdentifier(e=we){return this.component?this.component.multipleInstances?e:we:e}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function ua(n){return n===we?void 0:n}function ha(n){return n.instantiationMode==="EAGER"}/**
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
 */class da{constructor(e){this.name=e,this.providers=new Map}addComponent(e){const t=this.getProvider(e.name);if(t.isComponentSet())throw new Error(`Component ${e.name} has already been registered with ${this.name}`);t.setComponent(e)}addOrOverwriteComponent(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}getProvider(e){if(this.providers.has(e))return this.providers.get(e);const t=new ca(e,this);return this.providers.set(e,t),t}getProviders(){return Array.from(this.providers.values())}}/**
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
 */var A;(function(n){n[n.DEBUG=0]="DEBUG",n[n.VERBOSE=1]="VERBOSE",n[n.INFO=2]="INFO",n[n.WARN=3]="WARN",n[n.ERROR=4]="ERROR",n[n.SILENT=5]="SILENT"})(A||(A={}));const fa={debug:A.DEBUG,verbose:A.VERBOSE,info:A.INFO,warn:A.WARN,error:A.ERROR,silent:A.SILENT},pa=A.INFO,_a={[A.DEBUG]:"log",[A.VERBOSE]:"log",[A.INFO]:"info",[A.WARN]:"warn",[A.ERROR]:"error"},ma=(n,e,...t)=>{if(e<n.logLevel)return;const s=new Date().toISOString(),i=_a[e];if(i)console[i](`[${s}]  ${n.name}:`,...t);else throw new Error(`Attempted to log a message with an invalid logType (value: ${e})`)};class Ji{constructor(e){this.name=e,this._logLevel=pa,this._logHandler=ma,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(e){if(!(e in A))throw new TypeError(`Invalid value "${e}" assigned to \`logLevel\``);this._logLevel=e}setLogLevel(e){this._logLevel=typeof e=="string"?fa[e]:e}get logHandler(){return this._logHandler}set logHandler(e){if(typeof e!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}get userLogHandler(){return this._userLogHandler}set userLogHandler(e){this._userLogHandler=e}debug(...e){this._userLogHandler&&this._userLogHandler(this,A.DEBUG,...e),this._logHandler(this,A.DEBUG,...e)}log(...e){this._userLogHandler&&this._userLogHandler(this,A.VERBOSE,...e),this._logHandler(this,A.VERBOSE,...e)}info(...e){this._userLogHandler&&this._userLogHandler(this,A.INFO,...e),this._logHandler(this,A.INFO,...e)}warn(...e){this._userLogHandler&&this._userLogHandler(this,A.WARN,...e),this._logHandler(this,A.WARN,...e)}error(...e){this._userLogHandler&&this._userLogHandler(this,A.ERROR,...e),this._logHandler(this,A.ERROR,...e)}}const ga=(n,e)=>e.some(t=>n instanceof t);let Ks,Qs;function va(){return Ks||(Ks=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function ya(){return Qs||(Qs=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const Zi=new WeakMap,$n=new WeakMap,er=new WeakMap,wn=new WeakMap,as=new WeakMap;function ba(n){const e=new Promise((t,s)=>{const i=()=>{n.removeEventListener("success",r),n.removeEventListener("error",o)},r=()=>{t(ue(n.result)),i()},o=()=>{s(n.error),i()};n.addEventListener("success",r),n.addEventListener("error",o)});return e.then(t=>{t instanceof IDBCursor&&Zi.set(t,n)}).catch(()=>{}),as.set(e,n),e}function Ca(n){if($n.has(n))return;const e=new Promise((t,s)=>{const i=()=>{n.removeEventListener("complete",r),n.removeEventListener("error",o),n.removeEventListener("abort",o)},r=()=>{t(),i()},o=()=>{s(n.error||new DOMException("AbortError","AbortError")),i()};n.addEventListener("complete",r),n.addEventListener("error",o),n.addEventListener("abort",o)});$n.set(n,e)}let Bn={get(n,e,t){if(n instanceof IDBTransaction){if(e==="done")return $n.get(n);if(e==="objectStoreNames")return n.objectStoreNames||er.get(n);if(e==="store")return t.objectStoreNames[1]?void 0:t.objectStore(t.objectStoreNames[0])}return ue(n[e])},set(n,e,t){return n[e]=t,!0},has(n,e){return n instanceof IDBTransaction&&(e==="done"||e==="store")?!0:e in n}};function wa(n){Bn=n(Bn)}function Ea(n){return n===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(e,...t){const s=n.call(En(this),e,...t);return er.set(s,e.sort?e.sort():[e]),ue(s)}:ya().includes(n)?function(...e){return n.apply(En(this),e),ue(Zi.get(this))}:function(...e){return ue(n.apply(En(this),e))}}function Ia(n){return typeof n=="function"?Ea(n):(n instanceof IDBTransaction&&Ca(n),ga(n,va())?new Proxy(n,Bn):n)}function ue(n){if(n instanceof IDBRequest)return ba(n);if(wn.has(n))return wn.get(n);const e=Ia(n);return e!==n&&(wn.set(n,e),as.set(e,n)),e}const En=n=>as.get(n);function Sa(n,e,{blocked:t,upgrade:s,blocking:i,terminated:r}={}){const o=indexedDB.open(n,e),a=ue(o);return s&&o.addEventListener("upgradeneeded",l=>{s(ue(o.result),l.oldVersion,l.newVersion,ue(o.transaction),l)}),t&&o.addEventListener("blocked",l=>t(l.oldVersion,l.newVersion,l)),a.then(l=>{r&&l.addEventListener("close",()=>r()),i&&l.addEventListener("versionchange",c=>i(c.oldVersion,c.newVersion,c))}).catch(()=>{}),a}const Ta=["get","getKey","getAll","getAllKeys","count"],Ra=["put","add","delete","clear"],In=new Map;function Xs(n,e){if(!(n instanceof IDBDatabase&&!(e in n)&&typeof e=="string"))return;if(In.get(e))return In.get(e);const t=e.replace(/FromIndex$/,""),s=e!==t,i=Ra.includes(t);if(!(t in(s?IDBIndex:IDBObjectStore).prototype)||!(i||Ta.includes(t)))return;const r=async function(o,...a){const l=this.transaction(o,i?"readwrite":"readonly");let c=l.store;return s&&(c=c.index(a.shift())),(await Promise.all([c[t](...a),i&&l.done]))[0]};return In.set(e,r),r}wa(n=>({...n,get:(e,t,s)=>Xs(e,t)||n.get(e,t,s),has:(e,t)=>!!Xs(e,t)||n.has(e,t)}));/**
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
 */class Na{constructor(e){this.container=e}getPlatformInfoString(){return this.container.getProviders().map(t=>{if(ka(t)){const s=t.getImmediate();return`${s.library}/${s.version}`}else return null}).filter(t=>t).join(" ")}}function ka(n){const e=n.getComponent();return(e==null?void 0:e.type)==="VERSION"}const Wn="@firebase/app",Js="0.13.2";/**
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
 */const re=new Ji("@firebase/app"),Aa="@firebase/app-compat",Da="@firebase/analytics-compat",Pa="@firebase/analytics",Oa="@firebase/app-check-compat",Ma="@firebase/app-check",xa="@firebase/auth",La="@firebase/auth-compat",Fa="@firebase/database",$a="@firebase/data-connect",Ba="@firebase/database-compat",Wa="@firebase/functions",Ha="@firebase/functions-compat",Ua="@firebase/installations",ja="@firebase/installations-compat",Va="@firebase/messaging",qa="@firebase/messaging-compat",Ga="@firebase/performance",za="@firebase/performance-compat",Ya="@firebase/remote-config",Ka="@firebase/remote-config-compat",Qa="@firebase/storage",Xa="@firebase/storage-compat",Ja="@firebase/firestore",Za="@firebase/ai",el="@firebase/firestore-compat",tl="firebase",nl="11.10.0";/**
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
 */const Hn="[DEFAULT]",sl={[Wn]:"fire-core",[Aa]:"fire-core-compat",[Pa]:"fire-analytics",[Da]:"fire-analytics-compat",[Ma]:"fire-app-check",[Oa]:"fire-app-check-compat",[xa]:"fire-auth",[La]:"fire-auth-compat",[Fa]:"fire-rtdb",[$a]:"fire-data-connect",[Ba]:"fire-rtdb-compat",[Wa]:"fire-fn",[Ha]:"fire-fn-compat",[Ua]:"fire-iid",[ja]:"fire-iid-compat",[Va]:"fire-fcm",[qa]:"fire-fcm-compat",[Ga]:"fire-perf",[za]:"fire-perf-compat",[Ya]:"fire-rc",[Ka]:"fire-rc-compat",[Qa]:"fire-gcs",[Xa]:"fire-gcs-compat",[Ja]:"fire-fst",[el]:"fire-fst-compat",[Za]:"fire-vertex","fire-js":"fire-js",[tl]:"fire-js-all"};/**
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
 */const Bt=new Map,il=new Map,Un=new Map;function Zs(n,e){try{n.container.addComponent(e)}catch(t){re.debug(`Component ${e.name} failed to register with FirebaseApp ${n.name}`,t)}}function Wt(n){const e=n.name;if(Un.has(e))return re.debug(`There were multiple attempts to register component ${e}.`),!1;Un.set(e,n);for(const t of Bt.values())Zs(t,n);for(const t of il.values())Zs(t,n);return!0}function rl(n,e){const t=n.container.getProvider("heartbeat").getImmediate({optional:!0});return t&&t.triggerHeartbeat(),n.container.getProvider(e)}function ol(n){return n==null?!1:n.settings!==void 0}/**
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
 */const al={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},he=new Qi("app","Firebase",al);/**
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
 */class ll{constructor(e,t,s){this._isDeleted=!1,this._options=Object.assign({},e),this._config=Object.assign({},t),this._name=t.name,this._automaticDataCollectionEnabled=t.automaticDataCollectionEnabled,this._container=s,this.container.addComponent(new dt("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(e){this._isDeleted=e}checkDestroyed(){if(this.isDeleted)throw he.create("app-deleted",{appName:this._name})}}/**
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
 */const cl=nl;function tr(n,e={}){let t=n;typeof e!="object"&&(e={name:e});const s=Object.assign({name:Hn,automaticDataCollectionEnabled:!0},e),i=s.name;if(typeof i!="string"||!i)throw he.create("bad-app-name",{appName:String(i)});if(t||(t=Yi()),!t)throw he.create("no-options");const r=Bt.get(i);if(r){if($t(t,r.options)&&$t(s,r.config))return r;throw he.create("duplicate-app",{appName:i})}const o=new da(i);for(const l of Un.values())o.addComponent(l);const a=new ll(t,s,o);return Bt.set(i,a),a}function ul(n=Hn){const e=Bt.get(n);if(!e&&n===Hn&&Yi())return tr();if(!e)throw he.create("no-app",{appName:n});return e}function Fe(n,e,t){var s;let i=(s=sl[n])!==null&&s!==void 0?s:n;t&&(i+=`-${t}`);const r=i.match(/\s|\//),o=e.match(/\s|\//);if(r||o){const a=[`Unable to register library "${i}" with version "${e}":`];r&&a.push(`library name "${i}" contains illegal characters (whitespace or "/")`),r&&o&&a.push("and"),o&&a.push(`version name "${e}" contains illegal characters (whitespace or "/")`),re.warn(a.join(" "));return}Wt(new dt(`${i}-version`,()=>({library:i,version:e}),"VERSION"))}/**
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
 */const hl="firebase-heartbeat-database",dl=1,ft="firebase-heartbeat-store";let Sn=null;function nr(){return Sn||(Sn=Sa(hl,dl,{upgrade:(n,e)=>{switch(e){case 0:try{n.createObjectStore(ft)}catch(t){console.warn(t)}}}}).catch(n=>{throw he.create("idb-open",{originalErrorMessage:n.message})})),Sn}async function fl(n){try{const t=(await nr()).transaction(ft),s=await t.objectStore(ft).get(sr(n));return await t.done,s}catch(e){if(e instanceof wt)re.warn(e.message);else{const t=he.create("idb-get",{originalErrorMessage:e==null?void 0:e.message});re.warn(t.message)}}}async function ei(n,e){try{const s=(await nr()).transaction(ft,"readwrite");await s.objectStore(ft).put(e,sr(n)),await s.done}catch(t){if(t instanceof wt)re.warn(t.message);else{const s=he.create("idb-set",{originalErrorMessage:t==null?void 0:t.message});re.warn(s.message)}}}function sr(n){return`${n.name}!${n.options.appId}`}/**
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
 */const pl=1024,_l=30;class ml{constructor(e){this.container=e,this._heartbeatsCache=null;const t=this.container.getProvider("app").getImmediate();this._storage=new vl(t),this._heartbeatsCachePromise=this._storage.read().then(s=>(this._heartbeatsCache=s,s))}async triggerHeartbeat(){var e,t;try{const i=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),r=ti();if(((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((t=this._heartbeatsCache)===null||t===void 0?void 0:t.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===r||this._heartbeatsCache.heartbeats.some(o=>o.date===r))return;if(this._heartbeatsCache.heartbeats.push({date:r,agent:i}),this._heartbeatsCache.heartbeats.length>_l){const o=yl(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(o,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(s){re.warn(s)}}async getHeartbeatsHeader(){var e;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";const t=ti(),{heartbeatsToSend:s,unsentEntries:i}=gl(this._heartbeatsCache.heartbeats),r=Lt(JSON.stringify({version:2,heartbeats:s}));return this._heartbeatsCache.lastSentHeartbeatDate=t,i.length>0?(this._heartbeatsCache.heartbeats=i,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),r}catch(t){return re.warn(t),""}}}function ti(){return new Date().toISOString().substring(0,10)}function gl(n,e=pl){const t=[];let s=n.slice();for(const i of n){const r=t.find(o=>o.agent===i.agent);if(r){if(r.dates.push(i.date),ni(t)>e){r.dates.pop();break}}else if(t.push({agent:i.agent,dates:[i.date]}),ni(t)>e){t.pop();break}s=s.slice(1)}return{heartbeatsToSend:t,unsentEntries:s}}class vl{constructor(e){this.app=e,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return Zo()?ea().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const t=await fl(this.app);return t!=null&&t.heartbeats?t:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(e){var t;if(await this._canUseIndexedDBPromise){const i=await this.read();return ei(this.app,{lastSentHeartbeatDate:(t=e.lastSentHeartbeatDate)!==null&&t!==void 0?t:i.lastSentHeartbeatDate,heartbeats:e.heartbeats})}else return}async add(e){var t;if(await this._canUseIndexedDBPromise){const i=await this.read();return ei(this.app,{lastSentHeartbeatDate:(t=e.lastSentHeartbeatDate)!==null&&t!==void 0?t:i.lastSentHeartbeatDate,heartbeats:[...i.heartbeats,...e.heartbeats]})}else return}}function ni(n){return Lt(JSON.stringify({version:2,heartbeats:n})).length}function yl(n){if(n.length===0)return-1;let e=0,t=n[0].date;for(let s=1;s<n.length;s++)n[s].date<t&&(t=n[s].date,e=s);return e}/**
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
 */function bl(n){Wt(new dt("platform-logger",e=>new Na(e),"PRIVATE")),Wt(new dt("heartbeat",e=>new ml(e),"PRIVATE")),Fe(Wn,Js,n),Fe(Wn,Js,"esm2017"),Fe("fire-js","")}bl("");var si={};const ii="@firebase/database",ri="1.0.20";/**
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
 */let ir="";function Cl(n){ir=n}/**
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
 */class wl{constructor(e){this.domStorage_=e,this.prefix_="firebase:"}set(e,t){t==null?this.domStorage_.removeItem(this.prefixedName_(e)):this.domStorage_.setItem(this.prefixedName_(e),L(t))}get(e){const t=this.domStorage_.getItem(this.prefixedName_(e));return t==null?null:ht(t)}remove(e){this.domStorage_.removeItem(this.prefixedName_(e))}prefixedName_(e){return this.prefix_+e}toString(){return this.domStorage_.toString()}}/**
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
 */class El{constructor(){this.cache_={},this.isInMemoryStorage=!0}set(e,t){t==null?delete this.cache_[e]:this.cache_[e]=t}get(e){return Z(this.cache_,e)?this.cache_[e]:null}remove(e){delete this.cache_[e]}}/**
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
 */const rr=function(n){try{if(typeof window<"u"&&typeof window[n]<"u"){const e=window[n];return e.setItem("firebase:sentinel","cache"),e.removeItem("firebase:sentinel"),new wl(e)}}catch{}return new El},Ie=rr("localStorage"),Il=rr("sessionStorage");/**
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
 */const $e=new Ji("@firebase/database"),or=(function(){let n=1;return function(){return n++}})(),ar=function(n){const e=la(n),t=new aa;t.update(e);const s=t.digest();return rs.encodeByteArray(s)},Et=function(...n){let e="";for(let t=0;t<n.length;t++){const s=n[t];Array.isArray(s)||s&&typeof s=="object"&&typeof s.length=="number"?e+=Et.apply(null,s):typeof s=="object"?e+=L(s):e+=s,e+=" "}return e};let it=null,oi=!0;const Sl=function(n,e){f(!0,"Can't turn on custom loggers persistently."),$e.logLevel=A.VERBOSE,it=$e.log.bind($e)},B=function(...n){if(oi===!0&&(oi=!1,it===null&&Il.get("logging_enabled")===!0&&Sl()),it){const e=Et.apply(null,n);it(e)}},It=function(n){return function(...e){B(n,...e)}},jn=function(...n){const e="FIREBASE INTERNAL ERROR: "+Et(...n);$e.error(e)},oe=function(...n){const e=`FIREBASE FATAL ERROR: ${Et(...n)}`;throw $e.error(e),new Error(e)},U=function(...n){const e="FIREBASE WARNING: "+Et(...n);$e.warn(e)},Tl=function(){typeof window<"u"&&window.location&&window.location.protocol&&window.location.protocol.indexOf("https:")!==-1&&U("Insecure Firebase access from a secure page. Please use https in calls to new Firebase().")},rn=function(n){return typeof n=="number"&&(n!==n||n===Number.POSITIVE_INFINITY||n===Number.NEGATIVE_INFINITY)},Rl=function(n){if(document.readyState==="complete")n();else{let e=!1;const t=function(){if(!document.body){setTimeout(t,Math.floor(10));return}e||(e=!0,n())};document.addEventListener?(document.addEventListener("DOMContentLoaded",t,!1),window.addEventListener("load",t,!1)):document.attachEvent&&(document.attachEvent("onreadystatechange",()=>{document.readyState==="complete"&&t()}),window.attachEvent("onload",t))}},Ue="[MIN_NAME]",Te="[MAX_NAME]",Ae=function(n,e){if(n===e)return 0;if(n===Ue||e===Te)return-1;if(e===Ue||n===Te)return 1;{const t=ai(n),s=ai(e);return t!==null?s!==null?t-s===0?n.length-e.length:t-s:-1:s!==null?1:n<e?-1:1}},Nl=function(n,e){return n===e?0:n<e?-1:1},Ze=function(n,e){if(e&&n in e)return e[n];throw new Error("Missing required key ("+n+") in object: "+L(e))},ls=function(n){if(typeof n!="object"||n===null)return L(n);const e=[];for(const s in n)e.push(s);e.sort();let t="{";for(let s=0;s<e.length;s++)s!==0&&(t+=","),t+=L(e[s]),t+=":",t+=ls(n[e[s]]);return t+="}",t},lr=function(n,e){const t=n.length;if(t<=e)return[n];const s=[];for(let i=0;i<t;i+=e)i+e>t?s.push(n.substring(i,t)):s.push(n.substring(i,i+e));return s};function W(n,e){for(const t in n)n.hasOwnProperty(t)&&e(t,n[t])}const cr=function(n){f(!rn(n),"Invalid JSON number");const e=11,t=52,s=(1<<e-1)-1;let i,r,o,a,l;n===0?(r=0,o=0,i=1/n===-1/0?1:0):(i=n<0,n=Math.abs(n),n>=Math.pow(2,1-s)?(a=Math.min(Math.floor(Math.log(n)/Math.LN2),s),r=a+s,o=Math.round(n*Math.pow(2,t-a)-Math.pow(2,t))):(r=0,o=Math.round(n/Math.pow(2,1-s-t))));const c=[];for(l=t;l;l-=1)c.push(o%2?1:0),o=Math.floor(o/2);for(l=e;l;l-=1)c.push(r%2?1:0),r=Math.floor(r/2);c.push(i?1:0),c.reverse();const d=c.join("");let u="";for(l=0;l<64;l+=8){let h=parseInt(d.substr(l,8),2).toString(16);h.length===1&&(h="0"+h),u=u+h}return u.toLowerCase()},kl=function(){return!!(typeof window=="object"&&window.chrome&&window.chrome.extension&&!/^chrome/.test(window.location.href))},Al=function(){return typeof Windows=="object"&&typeof Windows.UI=="object"};function Dl(n,e){let t="Unknown Error";n==="too_big"?t="The data requested exceeds the maximum size that can be accessed with a single request.":n==="permission_denied"?t="Client doesn't have permission to access the desired data.":n==="unavailable"&&(t="The service is unavailable");const s=new Error(n+" at "+e._path.toString()+": "+t);return s.code=n.toUpperCase(),s}const Pl=new RegExp("^-?(0*)\\d{1,10}$"),Ol=-2147483648,Ml=2147483647,ai=function(n){if(Pl.test(n)){const e=Number(n);if(e>=Ol&&e<=Ml)return e}return null},Ke=function(n){try{n()}catch(e){setTimeout(()=>{const t=e.stack||"";throw U("Exception was thrown by user callback.",t),e},Math.floor(0))}},xl=function(){return(typeof window=="object"&&window.navigator&&window.navigator.userAgent||"").search(/googlebot|google webmaster tools|bingbot|yahoo! slurp|baiduspider|yandexbot|duckduckbot/i)>=0},rt=function(n,e){const t=setTimeout(n,e);return typeof t=="number"&&typeof Deno<"u"&&Deno.unrefTimer?Deno.unrefTimer(t):typeof t=="object"&&t.unref&&t.unref(),t};/**
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
 */class Ll{constructor(e,t){this.appCheckProvider=t,this.appName=e.name,ol(e)&&e.settings.appCheckToken&&(this.serverAppAppCheckToken=e.settings.appCheckToken),this.appCheck=t==null?void 0:t.getImmediate({optional:!0}),this.appCheck||t==null||t.get().then(s=>this.appCheck=s)}getToken(e){if(this.serverAppAppCheckToken){if(e)throw new Error("Attempted reuse of `FirebaseServerApp.appCheckToken` after previous usage failed.");return Promise.resolve({token:this.serverAppAppCheckToken})}return this.appCheck?this.appCheck.getToken(e):new Promise((t,s)=>{setTimeout(()=>{this.appCheck?this.getToken(e).then(t,s):t(null)},0)})}addTokenChangeListener(e){var t;(t=this.appCheckProvider)===null||t===void 0||t.get().then(s=>s.addTokenListener(e))}notifyForInvalidToken(){U(`Provided AppCheck credentials for the app named "${this.appName}" are invalid. This usually indicates your app was not initialized correctly.`)}}/**
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
 */class Fl{constructor(e,t,s){this.appName_=e,this.firebaseOptions_=t,this.authProvider_=s,this.auth_=null,this.auth_=s.getImmediate({optional:!0}),this.auth_||s.onInit(i=>this.auth_=i)}getToken(e){return this.auth_?this.auth_.getToken(e).catch(t=>t&&t.code==="auth/token-not-initialized"?(B("Got auth/token-not-initialized error.  Treating as null token."),null):Promise.reject(t)):new Promise((t,s)=>{setTimeout(()=>{this.auth_?this.getToken(e).then(t,s):t(null)},0)})}addTokenChangeListener(e){this.auth_?this.auth_.addAuthTokenListener(e):this.authProvider_.get().then(t=>t.addAuthTokenListener(e))}removeTokenChangeListener(e){this.authProvider_.get().then(t=>t.removeAuthTokenListener(e))}notifyForInvalidToken(){let e='Provided authentication credentials for the app named "'+this.appName_+'" are invalid. This usually indicates your app was not initialized correctly. ';"credential"in this.firebaseOptions_?e+='Make sure the "credential" property provided to initializeApp() is authorized to access the specified "databaseURL" and is from the correct project.':"serviceAccount"in this.firebaseOptions_?e+='Make sure the "serviceAccount" property provided to initializeApp() is authorized to access the specified "databaseURL" and is from the correct project.':e+='Make sure the "apiKey" and "databaseURL" properties provided to initializeApp() match the values provided for your app at https://console.firebase.google.com/.',U(e)}}class Mt{constructor(e){this.accessToken=e}getToken(e){return Promise.resolve({accessToken:this.accessToken})}addTokenChangeListener(e){e(this.accessToken)}removeTokenChangeListener(e){}notifyForInvalidToken(){}}Mt.OWNER="owner";/**
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
 */const cs="5",ur="v",hr="s",dr="r",fr="f",pr=/(console\.firebase|firebase-console-\w+\.corp|firebase\.corp)\.google\.com/,_r="ls",mr="p",Vn="ac",gr="websocket",vr="long_polling";/**
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
 */class yr{constructor(e,t,s,i,r=!1,o="",a=!1,l=!1,c=null){this.secure=t,this.namespace=s,this.webSocketOnly=i,this.nodeAdmin=r,this.persistenceKey=o,this.includeNamespaceInQueryParams=a,this.isUsingEmulator=l,this.emulatorOptions=c,this._host=e.toLowerCase(),this._domain=this._host.substr(this._host.indexOf(".")+1),this.internalHost=Ie.get("host:"+e)||this._host}isCacheableHost(){return this.internalHost.substr(0,2)==="s-"}isCustomHost(){return this._domain!=="firebaseio.com"&&this._domain!=="firebaseio-demo.com"}get host(){return this._host}set host(e){e!==this.internalHost&&(this.internalHost=e,this.isCacheableHost()&&Ie.set("host:"+this._host,this.internalHost))}toString(){let e=this.toURLString();return this.persistenceKey&&(e+="<"+this.persistenceKey+">"),e}toURLString(){const e=this.secure?"https://":"http://",t=this.includeNamespaceInQueryParams?`?ns=${this.namespace}`:"";return`${e}${this.host}/${t}`}}function $l(n){return n.host!==n.internalHost||n.isCustomHost()||n.includeNamespaceInQueryParams}function br(n,e,t){f(typeof e=="string","typeof type must == string"),f(typeof t=="object","typeof params must == object");let s;if(e===gr)s=(n.secure?"wss://":"ws://")+n.internalHost+"/.ws?";else if(e===vr)s=(n.secure?"https://":"http://")+n.internalHost+"/.lp?";else throw new Error("Unknown connection type: "+e);$l(n)&&(t.ns=n.namespace);const i=[];return W(t,(r,o)=>{i.push(r+"="+o)}),s+i.join("&")}/**
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
 */class Bl{constructor(){this.counters_={}}incrementCounter(e,t=1){Z(this.counters_,e)||(this.counters_[e]=0),this.counters_[e]+=t}get(){return Fo(this.counters_)}}/**
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
 */const Tn={},Rn={};function us(n){const e=n.toString();return Tn[e]||(Tn[e]=new Bl),Tn[e]}function Wl(n,e){const t=n.toString();return Rn[t]||(Rn[t]=e()),Rn[t]}/**
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
 */class Hl{constructor(e){this.onMessage_=e,this.pendingResponses=[],this.currentResponseNum=0,this.closeAfterResponse=-1,this.onClose=null}closeAfter(e,t){this.closeAfterResponse=e,this.onClose=t,this.closeAfterResponse<this.currentResponseNum&&(this.onClose(),this.onClose=null)}handleResponse(e,t){for(this.pendingResponses[e]=t;this.pendingResponses[this.currentResponseNum];){const s=this.pendingResponses[this.currentResponseNum];delete this.pendingResponses[this.currentResponseNum];for(let i=0;i<s.length;++i)s[i]&&Ke(()=>{this.onMessage_(s[i])});if(this.currentResponseNum===this.closeAfterResponse){this.onClose&&(this.onClose(),this.onClose=null);break}this.currentResponseNum++}}}/**
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
 */const li="start",Ul="close",jl="pLPCommand",Vl="pRTLPCB",Cr="id",wr="pw",Er="ser",ql="cb",Gl="seg",zl="ts",Yl="d",Kl="dframe",Ir=1870,Sr=30,Ql=Ir-Sr,Xl=25e3,Jl=3e4;class Me{constructor(e,t,s,i,r,o,a){this.connId=e,this.repoInfo=t,this.applicationId=s,this.appCheckToken=i,this.authToken=r,this.transportSessionId=o,this.lastSessionId=a,this.bytesSent=0,this.bytesReceived=0,this.everConnected_=!1,this.log_=It(e),this.stats_=us(t),this.urlFn=l=>(this.appCheckToken&&(l[Vn]=this.appCheckToken),br(t,vr,l))}open(e,t){this.curSegmentNum=0,this.onDisconnect_=t,this.myPacketOrderer=new Hl(e),this.isClosed_=!1,this.connectTimeoutTimer_=setTimeout(()=>{this.log_("Timed out trying to connect."),this.onClosed_(),this.connectTimeoutTimer_=null},Math.floor(Jl)),Rl(()=>{if(this.isClosed_)return;this.scriptTagHolder=new hs((...r)=>{const[o,a,l,c,d]=r;if(this.incrementIncomingBytes_(r),!!this.scriptTagHolder)if(this.connectTimeoutTimer_&&(clearTimeout(this.connectTimeoutTimer_),this.connectTimeoutTimer_=null),this.everConnected_=!0,o===li)this.id=a,this.password=l;else if(o===Ul)a?(this.scriptTagHolder.sendNewPolls=!1,this.myPacketOrderer.closeAfter(a,()=>{this.onClosed_()})):this.onClosed_();else throw new Error("Unrecognized command received: "+o)},(...r)=>{const[o,a]=r;this.incrementIncomingBytes_(r),this.myPacketOrderer.handleResponse(o,a)},()=>{this.onClosed_()},this.urlFn);const s={};s[li]="t",s[Er]=Math.floor(Math.random()*1e8),this.scriptTagHolder.uniqueCallbackIdentifier&&(s[ql]=this.scriptTagHolder.uniqueCallbackIdentifier),s[ur]=cs,this.transportSessionId&&(s[hr]=this.transportSessionId),this.lastSessionId&&(s[_r]=this.lastSessionId),this.applicationId&&(s[mr]=this.applicationId),this.appCheckToken&&(s[Vn]=this.appCheckToken),typeof location<"u"&&location.hostname&&pr.test(location.hostname)&&(s[dr]=fr);const i=this.urlFn(s);this.log_("Connecting via long-poll to "+i),this.scriptTagHolder.addTag(i,()=>{})})}start(){this.scriptTagHolder.startLongPoll(this.id,this.password),this.addDisconnectPingFrame(this.id,this.password)}static forceAllow(){Me.forceAllow_=!0}static forceDisallow(){Me.forceDisallow_=!0}static isAvailable(){return Me.forceAllow_?!0:!Me.forceDisallow_&&typeof document<"u"&&document.createElement!=null&&!kl()&&!Al()}markConnectionHealthy(){}shutdown_(){this.isClosed_=!0,this.scriptTagHolder&&(this.scriptTagHolder.close(),this.scriptTagHolder=null),this.myDisconnFrame&&(document.body.removeChild(this.myDisconnFrame),this.myDisconnFrame=null),this.connectTimeoutTimer_&&(clearTimeout(this.connectTimeoutTimer_),this.connectTimeoutTimer_=null)}onClosed_(){this.isClosed_||(this.log_("Longpoll is closing itself"),this.shutdown_(),this.onDisconnect_&&(this.onDisconnect_(this.everConnected_),this.onDisconnect_=null))}close(){this.isClosed_||(this.log_("Longpoll is being closed."),this.shutdown_())}send(e){const t=L(e);this.bytesSent+=t.length,this.stats_.incrementCounter("bytes_sent",t.length);const s=qi(t),i=lr(s,Ql);for(let r=0;r<i.length;r++)this.scriptTagHolder.enqueueSegment(this.curSegmentNum,i.length,i[r]),this.curSegmentNum++}addDisconnectPingFrame(e,t){this.myDisconnFrame=document.createElement("iframe");const s={};s[Kl]="t",s[Cr]=e,s[wr]=t,this.myDisconnFrame.src=this.urlFn(s),this.myDisconnFrame.style.display="none",document.body.appendChild(this.myDisconnFrame)}incrementIncomingBytes_(e){const t=L(e).length;this.bytesReceived+=t,this.stats_.incrementCounter("bytes_received",t)}}class hs{constructor(e,t,s,i){this.onDisconnect=s,this.urlFn=i,this.outstandingRequests=new Set,this.pendingSegs=[],this.currentSerial=Math.floor(Math.random()*1e8),this.sendNewPolls=!0;{this.uniqueCallbackIdentifier=or(),window[jl+this.uniqueCallbackIdentifier]=e,window[Vl+this.uniqueCallbackIdentifier]=t,this.myIFrame=hs.createIFrame_();let r="";this.myIFrame.src&&this.myIFrame.src.substr(0,11)==="javascript:"&&(r='<script>document.domain="'+document.domain+'";<\/script>');const o="<html><body>"+r+"</body></html>";try{this.myIFrame.doc.open(),this.myIFrame.doc.write(o),this.myIFrame.doc.close()}catch(a){B("frame writing exception"),a.stack&&B(a.stack),B(a)}}}static createIFrame_(){const e=document.createElement("iframe");if(e.style.display="none",document.body){document.body.appendChild(e);try{e.contentWindow.document||B("No IE domain setting required")}catch{const s=document.domain;e.src="javascript:void((function(){document.open();document.domain='"+s+"';document.close();})())"}}else throw"Document body has not initialized. Wait to initialize Firebase until after the document is ready.";return e.contentDocument?e.doc=e.contentDocument:e.contentWindow?e.doc=e.contentWindow.document:e.document&&(e.doc=e.document),e}close(){this.alive=!1,this.myIFrame&&(this.myIFrame.doc.body.textContent="",setTimeout(()=>{this.myIFrame!==null&&(document.body.removeChild(this.myIFrame),this.myIFrame=null)},Math.floor(0)));const e=this.onDisconnect;e&&(this.onDisconnect=null,e())}startLongPoll(e,t){for(this.myID=e,this.myPW=t,this.alive=!0;this.newRequest_(););}newRequest_(){if(this.alive&&this.sendNewPolls&&this.outstandingRequests.size<(this.pendingSegs.length>0?2:1)){this.currentSerial++;const e={};e[Cr]=this.myID,e[wr]=this.myPW,e[Er]=this.currentSerial;let t=this.urlFn(e),s="",i=0;for(;this.pendingSegs.length>0&&this.pendingSegs[0].d.length+Sr+s.length<=Ir;){const o=this.pendingSegs.shift();s=s+"&"+Gl+i+"="+o.seg+"&"+zl+i+"="+o.ts+"&"+Yl+i+"="+o.d,i++}return t=t+s,this.addLongPollTag_(t,this.currentSerial),!0}else return!1}enqueueSegment(e,t,s){this.pendingSegs.push({seg:e,ts:t,d:s}),this.alive&&this.newRequest_()}addLongPollTag_(e,t){this.outstandingRequests.add(t);const s=()=>{this.outstandingRequests.delete(t),this.newRequest_()},i=setTimeout(s,Math.floor(Xl)),r=()=>{clearTimeout(i),s()};this.addTag(e,r)}addTag(e,t){setTimeout(()=>{try{if(!this.sendNewPolls)return;const s=this.myIFrame.doc.createElement("script");s.type="text/javascript",s.async=!0,s.src=e,s.onload=s.onreadystatechange=function(){const i=s.readyState;(!i||i==="loaded"||i==="complete")&&(s.onload=s.onreadystatechange=null,s.parentNode&&s.parentNode.removeChild(s),t())},s.onerror=()=>{B("Long-poll script failed to load: "+e),this.sendNewPolls=!1,this.close()},this.myIFrame.doc.body.appendChild(s)}catch{}},Math.floor(1))}}/**
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
 */const Zl=16384,ec=45e3;let Ht=null;typeof MozWebSocket<"u"?Ht=MozWebSocket:typeof WebSocket<"u"&&(Ht=WebSocket);class Q{constructor(e,t,s,i,r,o,a){this.connId=e,this.applicationId=s,this.appCheckToken=i,this.authToken=r,this.keepaliveTimer=null,this.frames=null,this.totalFrames=0,this.bytesSent=0,this.bytesReceived=0,this.log_=It(this.connId),this.stats_=us(t),this.connURL=Q.connectionURL_(t,o,a,i,s),this.nodeAdmin=t.nodeAdmin}static connectionURL_(e,t,s,i,r){const o={};return o[ur]=cs,typeof location<"u"&&location.hostname&&pr.test(location.hostname)&&(o[dr]=fr),t&&(o[hr]=t),s&&(o[_r]=s),i&&(o[Vn]=i),r&&(o[mr]=r),br(e,gr,o)}open(e,t){this.onDisconnect=t,this.onMessage=e,this.log_("Websocket connecting to "+this.connURL),this.everConnected_=!1,Ie.set("previous_websocket_failure",!0);try{let s;Jo(),this.mySock=new Ht(this.connURL,[],s)}catch(s){this.log_("Error instantiating WebSocket.");const i=s.message||s.data;i&&this.log_(i),this.onClosed_();return}this.mySock.onopen=()=>{this.log_("Websocket connected."),this.everConnected_=!0},this.mySock.onclose=()=>{this.log_("Websocket connection was disconnected."),this.mySock=null,this.onClosed_()},this.mySock.onmessage=s=>{this.handleIncomingFrame(s)},this.mySock.onerror=s=>{this.log_("WebSocket error.  Closing connection.");const i=s.message||s.data;i&&this.log_(i),this.onClosed_()}}start(){}static forceDisallow(){Q.forceDisallow_=!0}static isAvailable(){let e=!1;if(typeof navigator<"u"&&navigator.userAgent){const t=/Android ([0-9]{0,}\.[0-9]{0,})/,s=navigator.userAgent.match(t);s&&s.length>1&&parseFloat(s[1])<4.4&&(e=!0)}return!e&&Ht!==null&&!Q.forceDisallow_}static previouslyFailed(){return Ie.isInMemoryStorage||Ie.get("previous_websocket_failure")===!0}markConnectionHealthy(){Ie.remove("previous_websocket_failure")}appendFrame_(e){if(this.frames.push(e),this.frames.length===this.totalFrames){const t=this.frames.join("");this.frames=null;const s=ht(t);this.onMessage(s)}}handleNewFrameCount_(e){this.totalFrames=e,this.frames=[]}extractFrameCount_(e){if(f(this.frames===null,"We already have a frame buffer"),e.length<=6){const t=Number(e);if(!isNaN(t))return this.handleNewFrameCount_(t),null}return this.handleNewFrameCount_(1),e}handleIncomingFrame(e){if(this.mySock===null)return;const t=e.data;if(this.bytesReceived+=t.length,this.stats_.incrementCounter("bytes_received",t.length),this.resetKeepAlive(),this.frames!==null)this.appendFrame_(t);else{const s=this.extractFrameCount_(t);s!==null&&this.appendFrame_(s)}}send(e){this.resetKeepAlive();const t=L(e);this.bytesSent+=t.length,this.stats_.incrementCounter("bytes_sent",t.length);const s=lr(t,Zl);s.length>1&&this.sendString_(String(s.length));for(let i=0;i<s.length;i++)this.sendString_(s[i])}shutdown_(){this.isClosed_=!0,this.keepaliveTimer&&(clearInterval(this.keepaliveTimer),this.keepaliveTimer=null),this.mySock&&(this.mySock.close(),this.mySock=null)}onClosed_(){this.isClosed_||(this.log_("WebSocket is closing itself"),this.shutdown_(),this.onDisconnect&&(this.onDisconnect(this.everConnected_),this.onDisconnect=null))}close(){this.isClosed_||(this.log_("WebSocket is being closed"),this.shutdown_())}resetKeepAlive(){clearInterval(this.keepaliveTimer),this.keepaliveTimer=setInterval(()=>{this.mySock&&this.sendString_("0"),this.resetKeepAlive()},Math.floor(ec))}sendString_(e){try{this.mySock.send(e)}catch(t){this.log_("Exception thrown from WebSocket.send():",t.message||t.data,"Closing connection."),setTimeout(this.onClosed_.bind(this),0)}}}Q.responsesRequiredToBeHealthy=2;Q.healthyTimeout=3e4;/**
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
 */class pt{static get ALL_TRANSPORTS(){return[Me,Q]}static get IS_TRANSPORT_INITIALIZED(){return this.globalTransportInitialized_}constructor(e){this.initTransports_(e)}initTransports_(e){const t=Q&&Q.isAvailable();let s=t&&!Q.previouslyFailed();if(e.webSocketOnly&&(t||U("wss:// URL used, but browser isn't known to support websockets.  Trying anyway."),s=!0),s)this.transports_=[Q];else{const i=this.transports_=[];for(const r of pt.ALL_TRANSPORTS)r&&r.isAvailable()&&i.push(r);pt.globalTransportInitialized_=!0}}initialTransport(){if(this.transports_.length>0)return this.transports_[0];throw new Error("No transports available")}upgradeTransport(){return this.transports_.length>1?this.transports_[1]:null}}pt.globalTransportInitialized_=!1;/**
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
 */const tc=6e4,nc=5e3,sc=10*1024,ic=100*1024,Nn="t",ci="d",rc="s",ui="r",oc="e",hi="o",di="a",fi="n",pi="p",ac="h";class lc{constructor(e,t,s,i,r,o,a,l,c,d){this.id=e,this.repoInfo_=t,this.applicationId_=s,this.appCheckToken_=i,this.authToken_=r,this.onMessage_=o,this.onReady_=a,this.onDisconnect_=l,this.onKill_=c,this.lastSessionId=d,this.connectionCount=0,this.pendingDataMessages=[],this.state_=0,this.log_=It("c:"+this.id+":"),this.transportManager_=new pt(t),this.log_("Connection created"),this.start_()}start_(){const e=this.transportManager_.initialTransport();this.conn_=new e(this.nextTransportId_(),this.repoInfo_,this.applicationId_,this.appCheckToken_,this.authToken_,null,this.lastSessionId),this.primaryResponsesRequired_=e.responsesRequiredToBeHealthy||0;const t=this.connReceiver_(this.conn_),s=this.disconnReceiver_(this.conn_);this.tx_=this.conn_,this.rx_=this.conn_,this.secondaryConn_=null,this.isHealthy_=!1,setTimeout(()=>{this.conn_&&this.conn_.open(t,s)},Math.floor(0));const i=e.healthyTimeout||0;i>0&&(this.healthyTimeout_=rt(()=>{this.healthyTimeout_=null,this.isHealthy_||(this.conn_&&this.conn_.bytesReceived>ic?(this.log_("Connection exceeded healthy timeout but has received "+this.conn_.bytesReceived+" bytes.  Marking connection healthy."),this.isHealthy_=!0,this.conn_.markConnectionHealthy()):this.conn_&&this.conn_.bytesSent>sc?this.log_("Connection exceeded healthy timeout but has sent "+this.conn_.bytesSent+" bytes.  Leaving connection alive."):(this.log_("Closing unhealthy connection after timeout."),this.close()))},Math.floor(i)))}nextTransportId_(){return"c:"+this.id+":"+this.connectionCount++}disconnReceiver_(e){return t=>{e===this.conn_?this.onConnectionLost_(t):e===this.secondaryConn_?(this.log_("Secondary connection lost."),this.onSecondaryConnectionLost_()):this.log_("closing an old connection")}}connReceiver_(e){return t=>{this.state_!==2&&(e===this.rx_?this.onPrimaryMessageReceived_(t):e===this.secondaryConn_?this.onSecondaryMessageReceived_(t):this.log_("message on old connection"))}}sendRequest(e){const t={t:"d",d:e};this.sendData_(t)}tryCleanupConnection(){this.tx_===this.secondaryConn_&&this.rx_===this.secondaryConn_&&(this.log_("cleaning up and promoting a connection: "+this.secondaryConn_.connId),this.conn_=this.secondaryConn_,this.secondaryConn_=null)}onSecondaryControl_(e){if(Nn in e){const t=e[Nn];t===di?this.upgradeIfSecondaryHealthy_():t===ui?(this.log_("Got a reset on secondary, closing it"),this.secondaryConn_.close(),(this.tx_===this.secondaryConn_||this.rx_===this.secondaryConn_)&&this.close()):t===hi&&(this.log_("got pong on secondary."),this.secondaryResponsesRequired_--,this.upgradeIfSecondaryHealthy_())}}onSecondaryMessageReceived_(e){const t=Ze("t",e),s=Ze("d",e);if(t==="c")this.onSecondaryControl_(s);else if(t==="d")this.pendingDataMessages.push(s);else throw new Error("Unknown protocol layer: "+t)}upgradeIfSecondaryHealthy_(){this.secondaryResponsesRequired_<=0?(this.log_("Secondary connection is healthy."),this.isHealthy_=!0,this.secondaryConn_.markConnectionHealthy(),this.proceedWithUpgrade_()):(this.log_("sending ping on secondary."),this.secondaryConn_.send({t:"c",d:{t:pi,d:{}}}))}proceedWithUpgrade_(){this.secondaryConn_.start(),this.log_("sending client ack on secondary"),this.secondaryConn_.send({t:"c",d:{t:di,d:{}}}),this.log_("Ending transmission on primary"),this.conn_.send({t:"c",d:{t:fi,d:{}}}),this.tx_=this.secondaryConn_,this.tryCleanupConnection()}onPrimaryMessageReceived_(e){const t=Ze("t",e),s=Ze("d",e);t==="c"?this.onControl_(s):t==="d"&&this.onDataMessage_(s)}onDataMessage_(e){this.onPrimaryResponse_(),this.onMessage_(e)}onPrimaryResponse_(){this.isHealthy_||(this.primaryResponsesRequired_--,this.primaryResponsesRequired_<=0&&(this.log_("Primary connection is healthy."),this.isHealthy_=!0,this.conn_.markConnectionHealthy()))}onControl_(e){const t=Ze(Nn,e);if(ci in e){const s=e[ci];if(t===ac){const i=Object.assign({},s);this.repoInfo_.isUsingEmulator&&(i.h=this.repoInfo_.host),this.onHandshake_(i)}else if(t===fi){this.log_("recvd end transmission on primary"),this.rx_=this.secondaryConn_;for(let i=0;i<this.pendingDataMessages.length;++i)this.onDataMessage_(this.pendingDataMessages[i]);this.pendingDataMessages=[],this.tryCleanupConnection()}else t===rc?this.onConnectionShutdown_(s):t===ui?this.onReset_(s):t===oc?jn("Server Error: "+s):t===hi?(this.log_("got pong on primary."),this.onPrimaryResponse_(),this.sendPingOnPrimaryIfNecessary_()):jn("Unknown control packet command: "+t)}}onHandshake_(e){const t=e.ts,s=e.v,i=e.h;this.sessionId=e.s,this.repoInfo_.host=i,this.state_===0&&(this.conn_.start(),this.onConnectionEstablished_(this.conn_,t),cs!==s&&U("Protocol version mismatch detected"),this.tryStartUpgrade_())}tryStartUpgrade_(){const e=this.transportManager_.upgradeTransport();e&&this.startUpgrade_(e)}startUpgrade_(e){this.secondaryConn_=new e(this.nextTransportId_(),this.repoInfo_,this.applicationId_,this.appCheckToken_,this.authToken_,this.sessionId),this.secondaryResponsesRequired_=e.responsesRequiredToBeHealthy||0;const t=this.connReceiver_(this.secondaryConn_),s=this.disconnReceiver_(this.secondaryConn_);this.secondaryConn_.open(t,s),rt(()=>{this.secondaryConn_&&(this.log_("Timed out trying to upgrade."),this.secondaryConn_.close())},Math.floor(tc))}onReset_(e){this.log_("Reset packet received.  New host: "+e),this.repoInfo_.host=e,this.state_===1?this.close():(this.closeConnections_(),this.start_())}onConnectionEstablished_(e,t){this.log_("Realtime connection established."),this.conn_=e,this.state_=1,this.onReady_&&(this.onReady_(t,this.sessionId),this.onReady_=null),this.primaryResponsesRequired_===0?(this.log_("Primary connection is healthy."),this.isHealthy_=!0):rt(()=>{this.sendPingOnPrimaryIfNecessary_()},Math.floor(nc))}sendPingOnPrimaryIfNecessary_(){!this.isHealthy_&&this.state_===1&&(this.log_("sending ping on primary."),this.sendData_({t:"c",d:{t:pi,d:{}}}))}onSecondaryConnectionLost_(){const e=this.secondaryConn_;this.secondaryConn_=null,(this.tx_===e||this.rx_===e)&&this.close()}onConnectionLost_(e){this.conn_=null,!e&&this.state_===0?(this.log_("Realtime connection failed."),this.repoInfo_.isCacheableHost()&&(Ie.remove("host:"+this.repoInfo_.host),this.repoInfo_.internalHost=this.repoInfo_.host)):this.state_===1&&this.log_("Realtime connection lost."),this.close()}onConnectionShutdown_(e){this.log_("Connection shutdown command received. Shutting down..."),this.onKill_&&(this.onKill_(e),this.onKill_=null),this.onDisconnect_=null,this.close()}sendData_(e){if(this.state_!==1)throw"Connection is not connected";this.tx_.send(e)}close(){this.state_!==2&&(this.log_("Closing realtime connection."),this.state_=2,this.closeConnections_(),this.onDisconnect_&&(this.onDisconnect_(),this.onDisconnect_=null))}closeConnections_(){this.log_("Shutting down all connections"),this.conn_&&(this.conn_.close(),this.conn_=null),this.secondaryConn_&&(this.secondaryConn_.close(),this.secondaryConn_=null),this.healthyTimeout_&&(clearTimeout(this.healthyTimeout_),this.healthyTimeout_=null)}}/**
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
 */class Tr{put(e,t,s,i){}merge(e,t,s,i){}refreshAuthToken(e){}refreshAppCheckToken(e){}onDisconnectPut(e,t,s){}onDisconnectMerge(e,t,s){}onDisconnectCancel(e,t){}reportStats(e){}}/**
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
 */class Rr{constructor(e){this.allowedEvents_=e,this.listeners_={},f(Array.isArray(e)&&e.length>0,"Requires a non-empty array")}trigger(e,...t){if(Array.isArray(this.listeners_[e])){const s=[...this.listeners_[e]];for(let i=0;i<s.length;i++)s[i].callback.apply(s[i].context,t)}}on(e,t,s){this.validateEventType_(e),this.listeners_[e]=this.listeners_[e]||[],this.listeners_[e].push({callback:t,context:s});const i=this.getInitialEvent(e);i&&t.apply(s,i)}off(e,t,s){this.validateEventType_(e);const i=this.listeners_[e]||[];for(let r=0;r<i.length;r++)if(i[r].callback===t&&(!s||s===i[r].context)){i.splice(r,1);return}}validateEventType_(e){f(this.allowedEvents_.find(t=>t===e),"Unknown event: "+e)}}/**
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
 */class Ut extends Rr{static getInstance(){return new Ut}constructor(){super(["online"]),this.online_=!0,typeof window<"u"&&typeof window.addEventListener<"u"&&!Ki()&&(window.addEventListener("online",()=>{this.online_||(this.online_=!0,this.trigger("online",!0))},!1),window.addEventListener("offline",()=>{this.online_&&(this.online_=!1,this.trigger("online",!1))},!1))}getInitialEvent(e){return f(e==="online","Unknown event type: "+e),[this.online_]}currentlyOnline(){return this.online_}}/**
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
 */const _i=32,mi=768;class S{constructor(e,t){if(t===void 0){this.pieces_=e.split("/");let s=0;for(let i=0;i<this.pieces_.length;i++)this.pieces_[i].length>0&&(this.pieces_[s]=this.pieces_[i],s++);this.pieces_.length=s,this.pieceNum_=0}else this.pieces_=e,this.pieceNum_=t}toString(){let e="";for(let t=this.pieceNum_;t<this.pieces_.length;t++)this.pieces_[t]!==""&&(e+="/"+this.pieces_[t]);return e||"/"}}function E(){return new S("")}function y(n){return n.pieceNum_>=n.pieces_.length?null:n.pieces_[n.pieceNum_]}function pe(n){return n.pieces_.length-n.pieceNum_}function N(n){let e=n.pieceNum_;return e<n.pieces_.length&&e++,new S(n.pieces_,e)}function ds(n){return n.pieceNum_<n.pieces_.length?n.pieces_[n.pieces_.length-1]:null}function cc(n){let e="";for(let t=n.pieceNum_;t<n.pieces_.length;t++)n.pieces_[t]!==""&&(e+="/"+encodeURIComponent(String(n.pieces_[t])));return e||"/"}function _t(n,e=0){return n.pieces_.slice(n.pieceNum_+e)}function Nr(n){if(n.pieceNum_>=n.pieces_.length)return null;const e=[];for(let t=n.pieceNum_;t<n.pieces_.length-1;t++)e.push(n.pieces_[t]);return new S(e,0)}function x(n,e){const t=[];for(let s=n.pieceNum_;s<n.pieces_.length;s++)t.push(n.pieces_[s]);if(e instanceof S)for(let s=e.pieceNum_;s<e.pieces_.length;s++)t.push(e.pieces_[s]);else{const s=e.split("/");for(let i=0;i<s.length;i++)s[i].length>0&&t.push(s[i])}return new S(t,0)}function b(n){return n.pieceNum_>=n.pieces_.length}function H(n,e){const t=y(n),s=y(e);if(t===null)return e;if(t===s)return H(N(n),N(e));throw new Error("INTERNAL ERROR: innerPath ("+e+") is not within outerPath ("+n+")")}function uc(n,e){const t=_t(n,0),s=_t(e,0);for(let i=0;i<t.length&&i<s.length;i++){const r=Ae(t[i],s[i]);if(r!==0)return r}return t.length===s.length?0:t.length<s.length?-1:1}function fs(n,e){if(pe(n)!==pe(e))return!1;for(let t=n.pieceNum_,s=e.pieceNum_;t<=n.pieces_.length;t++,s++)if(n.pieces_[t]!==e.pieces_[s])return!1;return!0}function q(n,e){let t=n.pieceNum_,s=e.pieceNum_;if(pe(n)>pe(e))return!1;for(;t<n.pieces_.length;){if(n.pieces_[t]!==e.pieces_[s])return!1;++t,++s}return!0}class hc{constructor(e,t){this.errorPrefix_=t,this.parts_=_t(e,0),this.byteLength_=Math.max(1,this.parts_.length);for(let s=0;s<this.parts_.length;s++)this.byteLength_+=sn(this.parts_[s]);kr(this)}}function dc(n,e){n.parts_.length>0&&(n.byteLength_+=1),n.parts_.push(e),n.byteLength_+=sn(e),kr(n)}function fc(n){const e=n.parts_.pop();n.byteLength_-=sn(e),n.parts_.length>0&&(n.byteLength_-=1)}function kr(n){if(n.byteLength_>mi)throw new Error(n.errorPrefix_+"has a key path longer than "+mi+" bytes ("+n.byteLength_+").");if(n.parts_.length>_i)throw new Error(n.errorPrefix_+"path specified exceeds the maximum depth that can be written ("+_i+") or object contains a cycle "+Ee(n))}function Ee(n){return n.parts_.length===0?"":"in property '"+n.parts_.join(".")+"'"}/**
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
 */class ps extends Rr{static getInstance(){return new ps}constructor(){super(["visible"]);let e,t;typeof document<"u"&&typeof document.addEventListener<"u"&&(typeof document.hidden<"u"?(t="visibilitychange",e="hidden"):typeof document.mozHidden<"u"?(t="mozvisibilitychange",e="mozHidden"):typeof document.msHidden<"u"?(t="msvisibilitychange",e="msHidden"):typeof document.webkitHidden<"u"&&(t="webkitvisibilitychange",e="webkitHidden")),this.visible_=!0,t&&document.addEventListener(t,()=>{const s=!document[e];s!==this.visible_&&(this.visible_=s,this.trigger("visible",s))},!1)}getInitialEvent(e){return f(e==="visible","Unknown event type: "+e),[this.visible_]}}/**
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
 */const et=1e3,pc=300*1e3,gi=30*1e3,_c=1.3,mc=3e4,gc="server_kill",vi=3;class ie extends Tr{constructor(e,t,s,i,r,o,a,l){if(super(),this.repoInfo_=e,this.applicationId_=t,this.onDataUpdate_=s,this.onConnectStatus_=i,this.onServerInfoUpdate_=r,this.authTokenProvider_=o,this.appCheckTokenProvider_=a,this.authOverride_=l,this.id=ie.nextPersistentConnectionId_++,this.log_=It("p:"+this.id+":"),this.interruptReasons_={},this.listens=new Map,this.outstandingPuts_=[],this.outstandingGets_=[],this.outstandingPutCount_=0,this.outstandingGetCount_=0,this.onDisconnectRequestQueue_=[],this.connected_=!1,this.reconnectDelay_=et,this.maxReconnectDelay_=pc,this.securityDebugCallback_=null,this.lastSessionId=null,this.establishConnectionTimer_=null,this.visible_=!1,this.requestCBHash_={},this.requestNumber_=0,this.realtime_=null,this.authToken_=null,this.appCheckToken_=null,this.forceTokenRefresh_=!1,this.invalidAuthTokenCount_=0,this.invalidAppCheckTokenCount_=0,this.firstConnection_=!0,this.lastConnectionAttemptTime_=null,this.lastConnectionEstablishedTime_=null,l)throw new Error("Auth override specified in options, but not supported on non Node.js platforms");ps.getInstance().on("visible",this.onVisible_,this),e.host.indexOf("fblocal")===-1&&Ut.getInstance().on("online",this.onOnline_,this)}sendRequest(e,t,s){const i=++this.requestNumber_,r={r:i,a:e,b:t};this.log_(L(r)),f(this.connected_,"sendRequest call when we're not connected not allowed."),this.realtime_.sendRequest(r),s&&(this.requestCBHash_[i]=s)}get(e){this.initConnection_();const t=new K,i={action:"g",request:{p:e._path.toString(),q:e._queryObject},onComplete:o=>{const a=o.d;o.s==="ok"?t.resolve(a):t.reject(a)}};this.outstandingGets_.push(i),this.outstandingGetCount_++;const r=this.outstandingGets_.length-1;return this.connected_&&this.sendGet_(r),t.promise}listen(e,t,s,i){this.initConnection_();const r=e._queryIdentifier,o=e._path.toString();this.log_("Listen called for "+o+" "+r),this.listens.has(o)||this.listens.set(o,new Map),f(e._queryParams.isDefault()||!e._queryParams.loadsAllData(),"listen() called for non-default but complete query"),f(!this.listens.get(o).has(r),"listen() called twice for same path/queryId.");const a={onComplete:i,hashFn:t,query:e,tag:s};this.listens.get(o).set(r,a),this.connected_&&this.sendListen_(a)}sendGet_(e){const t=this.outstandingGets_[e];this.sendRequest("g",t.request,s=>{delete this.outstandingGets_[e],this.outstandingGetCount_--,this.outstandingGetCount_===0&&(this.outstandingGets_=[]),t.onComplete&&t.onComplete(s)})}sendListen_(e){const t=e.query,s=t._path.toString(),i=t._queryIdentifier;this.log_("Listen on "+s+" for "+i);const r={p:s},o="q";e.tag&&(r.q=t._queryObject,r.t=e.tag),r.h=e.hashFn(),this.sendRequest(o,r,a=>{const l=a.d,c=a.s;ie.warnOnListenWarnings_(l,t),(this.listens.get(s)&&this.listens.get(s).get(i))===e&&(this.log_("listen response",a),c!=="ok"&&this.removeListen_(s,i),e.onComplete&&e.onComplete(c,l))})}static warnOnListenWarnings_(e,t){if(e&&typeof e=="object"&&Z(e,"w")){const s=Se(e,"w");if(Array.isArray(s)&&~s.indexOf("no_index")){const i='".indexOn": "'+t._queryParams.getIndex().toString()+'"',r=t._path.toString();U(`Using an unspecified index. Your data will be downloaded and filtered on the client. Consider adding ${i} at ${r} to your security rules for better performance.`)}}}refreshAuthToken(e){this.authToken_=e,this.log_("Auth token refreshed"),this.authToken_?this.tryAuth():this.connected_&&this.sendRequest("unauth",{},()=>{}),this.reduceReconnectDelayIfAdminCredential_(e)}reduceReconnectDelayIfAdminCredential_(e){(e&&e.length===40||ra(e))&&(this.log_("Admin auth credential detected.  Reducing max reconnect time."),this.maxReconnectDelay_=gi)}refreshAppCheckToken(e){this.appCheckToken_=e,this.log_("App check token refreshed"),this.appCheckToken_?this.tryAppCheck():this.connected_&&this.sendRequest("unappeck",{},()=>{})}tryAuth(){if(this.connected_&&this.authToken_){const e=this.authToken_,t=ia(e)?"auth":"gauth",s={cred:e};this.authOverride_===null?s.noauth=!0:typeof this.authOverride_=="object"&&(s.authvar=this.authOverride_),this.sendRequest(t,s,i=>{const r=i.s,o=i.d||"error";this.authToken_===e&&(r==="ok"?this.invalidAuthTokenCount_=0:this.onAuthRevoked_(r,o))})}}tryAppCheck(){this.connected_&&this.appCheckToken_&&this.sendRequest("appcheck",{token:this.appCheckToken_},e=>{const t=e.s,s=e.d||"error";t==="ok"?this.invalidAppCheckTokenCount_=0:this.onAppCheckRevoked_(t,s)})}unlisten(e,t){const s=e._path.toString(),i=e._queryIdentifier;this.log_("Unlisten called for "+s+" "+i),f(e._queryParams.isDefault()||!e._queryParams.loadsAllData(),"unlisten() called for non-default but complete query"),this.removeListen_(s,i)&&this.connected_&&this.sendUnlisten_(s,i,e._queryObject,t)}sendUnlisten_(e,t,s,i){this.log_("Unlisten on "+e+" for "+t);const r={p:e},o="n";i&&(r.q=s,r.t=i),this.sendRequest(o,r)}onDisconnectPut(e,t,s){this.initConnection_(),this.connected_?this.sendOnDisconnect_("o",e,t,s):this.onDisconnectRequestQueue_.push({pathString:e,action:"o",data:t,onComplete:s})}onDisconnectMerge(e,t,s){this.initConnection_(),this.connected_?this.sendOnDisconnect_("om",e,t,s):this.onDisconnectRequestQueue_.push({pathString:e,action:"om",data:t,onComplete:s})}onDisconnectCancel(e,t){this.initConnection_(),this.connected_?this.sendOnDisconnect_("oc",e,null,t):this.onDisconnectRequestQueue_.push({pathString:e,action:"oc",data:null,onComplete:t})}sendOnDisconnect_(e,t,s,i){const r={p:t,d:s};this.log_("onDisconnect "+e,r),this.sendRequest(e,r,o=>{i&&setTimeout(()=>{i(o.s,o.d)},Math.floor(0))})}put(e,t,s,i){this.putInternal("p",e,t,s,i)}merge(e,t,s,i){this.putInternal("m",e,t,s,i)}putInternal(e,t,s,i,r){this.initConnection_();const o={p:t,d:s};r!==void 0&&(o.h=r),this.outstandingPuts_.push({action:e,request:o,onComplete:i}),this.outstandingPutCount_++;const a=this.outstandingPuts_.length-1;this.connected_?this.sendPut_(a):this.log_("Buffering put: "+t)}sendPut_(e){const t=this.outstandingPuts_[e].action,s=this.outstandingPuts_[e].request,i=this.outstandingPuts_[e].onComplete;this.outstandingPuts_[e].queued=this.connected_,this.sendRequest(t,s,r=>{this.log_(t+" response",r),delete this.outstandingPuts_[e],this.outstandingPutCount_--,this.outstandingPutCount_===0&&(this.outstandingPuts_=[]),i&&i(r.s,r.d)})}reportStats(e){if(this.connected_){const t={c:e};this.log_("reportStats",t),this.sendRequest("s",t,s=>{if(s.s!=="ok"){const r=s.d;this.log_("reportStats","Error sending stats: "+r)}})}}onDataMessage_(e){if("r"in e){this.log_("from server: "+L(e));const t=e.r,s=this.requestCBHash_[t];s&&(delete this.requestCBHash_[t],s(e.b))}else{if("error"in e)throw"A server-side error has occurred: "+e.error;"a"in e&&this.onDataPush_(e.a,e.b)}}onDataPush_(e,t){this.log_("handleServerMessage",e,t),e==="d"?this.onDataUpdate_(t.p,t.d,!1,t.t):e==="m"?this.onDataUpdate_(t.p,t.d,!0,t.t):e==="c"?this.onListenRevoked_(t.p,t.q):e==="ac"?this.onAuthRevoked_(t.s,t.d):e==="apc"?this.onAppCheckRevoked_(t.s,t.d):e==="sd"?this.onSecurityDebugPacket_(t):jn("Unrecognized action received from server: "+L(e)+`
Are you using the latest client?`)}onReady_(e,t){this.log_("connection ready"),this.connected_=!0,this.lastConnectionEstablishedTime_=new Date().getTime(),this.handleTimestamp_(e),this.lastSessionId=t,this.firstConnection_&&this.sendConnectStats_(),this.restoreState_(),this.firstConnection_=!1,this.onConnectStatus_(!0)}scheduleConnect_(e){f(!this.realtime_,"Scheduling a connect when we're already connected/ing?"),this.establishConnectionTimer_&&clearTimeout(this.establishConnectionTimer_),this.establishConnectionTimer_=setTimeout(()=>{this.establishConnectionTimer_=null,this.establishConnection_()},Math.floor(e))}initConnection_(){!this.realtime_&&this.firstConnection_&&this.scheduleConnect_(0)}onVisible_(e){e&&!this.visible_&&this.reconnectDelay_===this.maxReconnectDelay_&&(this.log_("Window became visible.  Reducing delay."),this.reconnectDelay_=et,this.realtime_||this.scheduleConnect_(0)),this.visible_=e}onOnline_(e){e?(this.log_("Browser went online."),this.reconnectDelay_=et,this.realtime_||this.scheduleConnect_(0)):(this.log_("Browser went offline.  Killing connection."),this.realtime_&&this.realtime_.close())}onRealtimeDisconnect_(){if(this.log_("data client disconnected"),this.connected_=!1,this.realtime_=null,this.cancelSentTransactions_(),this.requestCBHash_={},this.shouldReconnect_()){this.visible_?this.lastConnectionEstablishedTime_&&(new Date().getTime()-this.lastConnectionEstablishedTime_>mc&&(this.reconnectDelay_=et),this.lastConnectionEstablishedTime_=null):(this.log_("Window isn't visible.  Delaying reconnect."),this.reconnectDelay_=this.maxReconnectDelay_,this.lastConnectionAttemptTime_=new Date().getTime());const e=Math.max(0,new Date().getTime()-this.lastConnectionAttemptTime_);let t=Math.max(0,this.reconnectDelay_-e);t=Math.random()*t,this.log_("Trying to reconnect in "+t+"ms"),this.scheduleConnect_(t),this.reconnectDelay_=Math.min(this.maxReconnectDelay_,this.reconnectDelay_*_c)}this.onConnectStatus_(!1)}async establishConnection_(){if(this.shouldReconnect_()){this.log_("Making a connection attempt"),this.lastConnectionAttemptTime_=new Date().getTime(),this.lastConnectionEstablishedTime_=null;const e=this.onDataMessage_.bind(this),t=this.onReady_.bind(this),s=this.onRealtimeDisconnect_.bind(this),i=this.id+":"+ie.nextConnectionId_++,r=this.lastSessionId;let o=!1,a=null;const l=function(){a?a.close():(o=!0,s())},c=function(u){f(a,"sendRequest call when we're not connected not allowed."),a.sendRequest(u)};this.realtime_={close:l,sendRequest:c};const d=this.forceTokenRefresh_;this.forceTokenRefresh_=!1;try{const[u,h]=await Promise.all([this.authTokenProvider_.getToken(d),this.appCheckTokenProvider_.getToken(d)]);o?B("getToken() completed but was canceled"):(B("getToken() completed. Creating connection."),this.authToken_=u&&u.accessToken,this.appCheckToken_=h&&h.token,a=new lc(i,this.repoInfo_,this.applicationId_,this.appCheckToken_,this.authToken_,e,t,s,p=>{U(p+" ("+this.repoInfo_.toString()+")"),this.interrupt(gc)},r))}catch(u){this.log_("Failed to get token: "+u),o||(this.repoInfo_.nodeAdmin&&U(u),l())}}}interrupt(e){B("Interrupting connection for reason: "+e),this.interruptReasons_[e]=!0,this.realtime_?this.realtime_.close():(this.establishConnectionTimer_&&(clearTimeout(this.establishConnectionTimer_),this.establishConnectionTimer_=null),this.connected_&&this.onRealtimeDisconnect_())}resume(e){B("Resuming connection for reason: "+e),delete this.interruptReasons_[e],Fn(this.interruptReasons_)&&(this.reconnectDelay_=et,this.realtime_||this.scheduleConnect_(0))}handleTimestamp_(e){const t=e-new Date().getTime();this.onServerInfoUpdate_({serverTimeOffset:t})}cancelSentTransactions_(){for(let e=0;e<this.outstandingPuts_.length;e++){const t=this.outstandingPuts_[e];t&&"h"in t.request&&t.queued&&(t.onComplete&&t.onComplete("disconnect"),delete this.outstandingPuts_[e],this.outstandingPutCount_--)}this.outstandingPutCount_===0&&(this.outstandingPuts_=[])}onListenRevoked_(e,t){let s;t?s=t.map(r=>ls(r)).join("$"):s="default";const i=this.removeListen_(e,s);i&&i.onComplete&&i.onComplete("permission_denied")}removeListen_(e,t){const s=new S(e).toString();let i;if(this.listens.has(s)){const r=this.listens.get(s);i=r.get(t),r.delete(t),r.size===0&&this.listens.delete(s)}else i=void 0;return i}onAuthRevoked_(e,t){B("Auth token revoked: "+e+"/"+t),this.authToken_=null,this.forceTokenRefresh_=!0,this.realtime_.close(),(e==="invalid_token"||e==="permission_denied")&&(this.invalidAuthTokenCount_++,this.invalidAuthTokenCount_>=vi&&(this.reconnectDelay_=gi,this.authTokenProvider_.notifyForInvalidToken()))}onAppCheckRevoked_(e,t){B("App check token revoked: "+e+"/"+t),this.appCheckToken_=null,this.forceTokenRefresh_=!0,(e==="invalid_token"||e==="permission_denied")&&(this.invalidAppCheckTokenCount_++,this.invalidAppCheckTokenCount_>=vi&&this.appCheckTokenProvider_.notifyForInvalidToken())}onSecurityDebugPacket_(e){this.securityDebugCallback_?this.securityDebugCallback_(e):"msg"in e&&console.log("FIREBASE: "+e.msg.replace(`
`,`
FIREBASE: `))}restoreState_(){this.tryAuth(),this.tryAppCheck();for(const e of this.listens.values())for(const t of e.values())this.sendListen_(t);for(let e=0;e<this.outstandingPuts_.length;e++)this.outstandingPuts_[e]&&this.sendPut_(e);for(;this.onDisconnectRequestQueue_.length;){const e=this.onDisconnectRequestQueue_.shift();this.sendOnDisconnect_(e.action,e.pathString,e.data,e.onComplete)}for(let e=0;e<this.outstandingGets_.length;e++)this.outstandingGets_[e]&&this.sendGet_(e)}sendConnectStats_(){const e={};let t="js";e["sdk."+t+"."+ir.replace(/\./g,"-")]=1,Ki()?e["framework.cordova"]=1:Xo()&&(e["framework.reactnative"]=1),this.reportStats(e)}shouldReconnect_(){const e=Ut.getInstance().currentlyOnline();return Fn(this.interruptReasons_)&&e}}ie.nextPersistentConnectionId_=0;ie.nextConnectionId_=0;/**
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
 */class C{constructor(e,t){this.name=e,this.node=t}static Wrap(e,t){return new C(e,t)}}/**
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
 */class on{getCompare(){return this.compare.bind(this)}indexedValueChanged(e,t){const s=new C(Ue,e),i=new C(Ue,t);return this.compare(s,i)!==0}minPost(){return C.MIN}}/**
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
 */let Dt;class Ar extends on{static get __EMPTY_NODE(){return Dt}static set __EMPTY_NODE(e){Dt=e}compare(e,t){return Ae(e.name,t.name)}isDefinedOn(e){throw Ye("KeyIndex.isDefinedOn not expected to be called.")}indexedValueChanged(e,t){return!1}minPost(){return C.MIN}maxPost(){return new C(Te,Dt)}makePost(e,t){return f(typeof e=="string","KeyIndex indexValue must always be a string."),new C(e,Dt)}toString(){return".key"}}const Be=new Ar;/**
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
 */class Pt{constructor(e,t,s,i,r=null){this.isReverse_=i,this.resultGenerator_=r,this.nodeStack_=[];let o=1;for(;!e.isEmpty();)if(e=e,o=t?s(e.key,t):1,i&&(o*=-1),o<0)this.isReverse_?e=e.left:e=e.right;else if(o===0){this.nodeStack_.push(e);break}else this.nodeStack_.push(e),this.isReverse_?e=e.right:e=e.left}getNext(){if(this.nodeStack_.length===0)return null;let e=this.nodeStack_.pop(),t;if(this.resultGenerator_?t=this.resultGenerator_(e.key,e.value):t={key:e.key,value:e.value},this.isReverse_)for(e=e.left;!e.isEmpty();)this.nodeStack_.push(e),e=e.right;else for(e=e.right;!e.isEmpty();)this.nodeStack_.push(e),e=e.left;return t}hasNext(){return this.nodeStack_.length>0}peek(){if(this.nodeStack_.length===0)return null;const e=this.nodeStack_[this.nodeStack_.length-1];return this.resultGenerator_?this.resultGenerator_(e.key,e.value):{key:e.key,value:e.value}}}class ${constructor(e,t,s,i,r){this.key=e,this.value=t,this.color=s??$.RED,this.left=i??j.EMPTY_NODE,this.right=r??j.EMPTY_NODE}copy(e,t,s,i,r){return new $(e??this.key,t??this.value,s??this.color,i??this.left,r??this.right)}count(){return this.left.count()+1+this.right.count()}isEmpty(){return!1}inorderTraversal(e){return this.left.inorderTraversal(e)||!!e(this.key,this.value)||this.right.inorderTraversal(e)}reverseTraversal(e){return this.right.reverseTraversal(e)||e(this.key,this.value)||this.left.reverseTraversal(e)}min_(){return this.left.isEmpty()?this:this.left.min_()}minKey(){return this.min_().key}maxKey(){return this.right.isEmpty()?this.key:this.right.maxKey()}insert(e,t,s){let i=this;const r=s(e,i.key);return r<0?i=i.copy(null,null,null,i.left.insert(e,t,s),null):r===0?i=i.copy(null,t,null,null,null):i=i.copy(null,null,null,null,i.right.insert(e,t,s)),i.fixUp_()}removeMin_(){if(this.left.isEmpty())return j.EMPTY_NODE;let e=this;return!e.left.isRed_()&&!e.left.left.isRed_()&&(e=e.moveRedLeft_()),e=e.copy(null,null,null,e.left.removeMin_(),null),e.fixUp_()}remove(e,t){let s,i;if(s=this,t(e,s.key)<0)!s.left.isEmpty()&&!s.left.isRed_()&&!s.left.left.isRed_()&&(s=s.moveRedLeft_()),s=s.copy(null,null,null,s.left.remove(e,t),null);else{if(s.left.isRed_()&&(s=s.rotateRight_()),!s.right.isEmpty()&&!s.right.isRed_()&&!s.right.left.isRed_()&&(s=s.moveRedRight_()),t(e,s.key)===0){if(s.right.isEmpty())return j.EMPTY_NODE;i=s.right.min_(),s=s.copy(i.key,i.value,null,null,s.right.removeMin_())}s=s.copy(null,null,null,null,s.right.remove(e,t))}return s.fixUp_()}isRed_(){return this.color}fixUp_(){let e=this;return e.right.isRed_()&&!e.left.isRed_()&&(e=e.rotateLeft_()),e.left.isRed_()&&e.left.left.isRed_()&&(e=e.rotateRight_()),e.left.isRed_()&&e.right.isRed_()&&(e=e.colorFlip_()),e}moveRedLeft_(){let e=this.colorFlip_();return e.right.left.isRed_()&&(e=e.copy(null,null,null,null,e.right.rotateRight_()),e=e.rotateLeft_(),e=e.colorFlip_()),e}moveRedRight_(){let e=this.colorFlip_();return e.left.left.isRed_()&&(e=e.rotateRight_(),e=e.colorFlip_()),e}rotateLeft_(){const e=this.copy(null,null,$.RED,null,this.right.left);return this.right.copy(null,null,this.color,e,null)}rotateRight_(){const e=this.copy(null,null,$.RED,this.left.right,null);return this.left.copy(null,null,this.color,null,e)}colorFlip_(){const e=this.left.copy(null,null,!this.left.color,null,null),t=this.right.copy(null,null,!this.right.color,null,null);return this.copy(null,null,!this.color,e,t)}checkMaxDepth_(){const e=this.check_();return Math.pow(2,e)<=this.count()+1}check_(){if(this.isRed_()&&this.left.isRed_())throw new Error("Red node has red child("+this.key+","+this.value+")");if(this.right.isRed_())throw new Error("Right child of ("+this.key+","+this.value+") is red");const e=this.left.check_();if(e!==this.right.check_())throw new Error("Black depths differ");return e+(this.isRed_()?0:1)}}$.RED=!0;$.BLACK=!1;class vc{copy(e,t,s,i,r){return this}insert(e,t,s){return new $(e,t,null)}remove(e,t){return this}count(){return 0}isEmpty(){return!0}inorderTraversal(e){return!1}reverseTraversal(e){return!1}minKey(){return null}maxKey(){return null}check_(){return 0}isRed_(){return!1}}class j{constructor(e,t=j.EMPTY_NODE){this.comparator_=e,this.root_=t}insert(e,t){return new j(this.comparator_,this.root_.insert(e,t,this.comparator_).copy(null,null,$.BLACK,null,null))}remove(e){return new j(this.comparator_,this.root_.remove(e,this.comparator_).copy(null,null,$.BLACK,null,null))}get(e){let t,s=this.root_;for(;!s.isEmpty();){if(t=this.comparator_(e,s.key),t===0)return s.value;t<0?s=s.left:t>0&&(s=s.right)}return null}getPredecessorKey(e){let t,s=this.root_,i=null;for(;!s.isEmpty();)if(t=this.comparator_(e,s.key),t===0){if(s.left.isEmpty())return i?i.key:null;for(s=s.left;!s.right.isEmpty();)s=s.right;return s.key}else t<0?s=s.left:t>0&&(i=s,s=s.right);throw new Error("Attempted to find predecessor key for a nonexistent key.  What gives?")}isEmpty(){return this.root_.isEmpty()}count(){return this.root_.count()}minKey(){return this.root_.minKey()}maxKey(){return this.root_.maxKey()}inorderTraversal(e){return this.root_.inorderTraversal(e)}reverseTraversal(e){return this.root_.reverseTraversal(e)}getIterator(e){return new Pt(this.root_,null,this.comparator_,!1,e)}getIteratorFrom(e,t){return new Pt(this.root_,e,this.comparator_,!1,t)}getReverseIteratorFrom(e,t){return new Pt(this.root_,e,this.comparator_,!0,t)}getReverseIterator(e){return new Pt(this.root_,null,this.comparator_,!0,e)}}j.EMPTY_NODE=new vc;/**
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
 */function yc(n,e){return Ae(n.name,e.name)}function _s(n,e){return Ae(n,e)}/**
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
 */let qn;function bc(n){qn=n}const Dr=function(n){return typeof n=="number"?"number:"+cr(n):"string:"+n},Pr=function(n){if(n.isLeafNode()){const e=n.val();f(typeof e=="string"||typeof e=="number"||typeof e=="object"&&Z(e,".sv"),"Priority must be a string or number.")}else f(n===qn||n.isEmpty(),"priority of unexpected type.");f(n===qn||n.getPriority().isEmpty(),"Priority nodes can't have a priority of their own.")};/**
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
 */let yi;class F{static set __childrenNodeConstructor(e){yi=e}static get __childrenNodeConstructor(){return yi}constructor(e,t=F.__childrenNodeConstructor.EMPTY_NODE){this.value_=e,this.priorityNode_=t,this.lazyHash_=null,f(this.value_!==void 0&&this.value_!==null,"LeafNode shouldn't be created with null/undefined value."),Pr(this.priorityNode_)}isLeafNode(){return!0}getPriority(){return this.priorityNode_}updatePriority(e){return new F(this.value_,e)}getImmediateChild(e){return e===".priority"?this.priorityNode_:F.__childrenNodeConstructor.EMPTY_NODE}getChild(e){return b(e)?this:y(e)===".priority"?this.priorityNode_:F.__childrenNodeConstructor.EMPTY_NODE}hasChild(){return!1}getPredecessorChildName(e,t){return null}updateImmediateChild(e,t){return e===".priority"?this.updatePriority(t):t.isEmpty()&&e!==".priority"?this:F.__childrenNodeConstructor.EMPTY_NODE.updateImmediateChild(e,t).updatePriority(this.priorityNode_)}updateChild(e,t){const s=y(e);return s===null?t:t.isEmpty()&&s!==".priority"?this:(f(s!==".priority"||pe(e)===1,".priority must be the last token in a path"),this.updateImmediateChild(s,F.__childrenNodeConstructor.EMPTY_NODE.updateChild(N(e),t)))}isEmpty(){return!1}numChildren(){return 0}forEachChild(e,t){return!1}val(e){return e&&!this.getPriority().isEmpty()?{".value":this.getValue(),".priority":this.getPriority().val()}:this.getValue()}hash(){if(this.lazyHash_===null){let e="";this.priorityNode_.isEmpty()||(e+="priority:"+Dr(this.priorityNode_.val())+":");const t=typeof this.value_;e+=t+":",t==="number"?e+=cr(this.value_):e+=this.value_,this.lazyHash_=ar(e)}return this.lazyHash_}getValue(){return this.value_}compareTo(e){return e===F.__childrenNodeConstructor.EMPTY_NODE?1:e instanceof F.__childrenNodeConstructor?-1:(f(e.isLeafNode(),"Unknown node type"),this.compareToLeafNode_(e))}compareToLeafNode_(e){const t=typeof e.value_,s=typeof this.value_,i=F.VALUE_TYPE_ORDER.indexOf(t),r=F.VALUE_TYPE_ORDER.indexOf(s);return f(i>=0,"Unknown leaf type: "+t),f(r>=0,"Unknown leaf type: "+s),i===r?s==="object"?0:this.value_<e.value_?-1:this.value_===e.value_?0:1:r-i}withIndex(){return this}isIndexed(){return!0}equals(e){if(e===this)return!0;if(e.isLeafNode()){const t=e;return this.value_===t.value_&&this.priorityNode_.equals(t.priorityNode_)}else return!1}}F.VALUE_TYPE_ORDER=["object","boolean","number","string"];/**
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
 */let Or,Mr;function Cc(n){Or=n}function wc(n){Mr=n}class Ec extends on{compare(e,t){const s=e.node.getPriority(),i=t.node.getPriority(),r=s.compareTo(i);return r===0?Ae(e.name,t.name):r}isDefinedOn(e){return!e.getPriority().isEmpty()}indexedValueChanged(e,t){return!e.getPriority().equals(t.getPriority())}minPost(){return C.MIN}maxPost(){return new C(Te,new F("[PRIORITY-POST]",Mr))}makePost(e,t){const s=Or(e);return new C(t,new F("[PRIORITY-POST]",s))}toString(){return".priority"}}const D=new Ec;/**
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
 */const Ic=Math.log(2);class Sc{constructor(e){const t=r=>parseInt(Math.log(r)/Ic,10),s=r=>parseInt(Array(r+1).join("1"),2);this.count=t(e+1),this.current_=this.count-1;const i=s(this.count);this.bits_=e+1&i}nextBitIsOne(){const e=!(this.bits_&1<<this.current_);return this.current_--,e}}const jt=function(n,e,t,s){n.sort(e);const i=function(l,c){const d=c-l;let u,h;if(d===0)return null;if(d===1)return u=n[l],h=t?t(u):u,new $(h,u.node,$.BLACK,null,null);{const p=parseInt(d/2,10)+l,_=i(l,p),w=i(p+1,c);return u=n[p],h=t?t(u):u,new $(h,u.node,$.BLACK,_,w)}},r=function(l){let c=null,d=null,u=n.length;const h=function(_,w){const P=u-_,z=u;u-=_;const te=i(P+1,z),be=n[P],Cn=t?t(be):be;p(new $(Cn,be.node,w,null,te))},p=function(_){c?(c.left=_,c=_):(d=_,c=_)};for(let _=0;_<l.count;++_){const w=l.nextBitIsOne(),P=Math.pow(2,l.count-(_+1));w?h(P,$.BLACK):(h(P,$.BLACK),h(P,$.RED))}return d},o=new Sc(n.length),a=r(o);return new j(s||e,a)};/**
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
 */let kn;const Oe={};class se{static get Default(){return f(Oe&&D,"ChildrenNode.ts has not been loaded"),kn=kn||new se({".priority":Oe},{".priority":D}),kn}constructor(e,t){this.indexes_=e,this.indexSet_=t}get(e){const t=Se(this.indexes_,e);if(!t)throw new Error("No index defined for "+e);return t instanceof j?t:null}hasIndex(e){return Z(this.indexSet_,e.toString())}addIndex(e,t){f(e!==Be,"KeyIndex always exists and isn't meant to be added to the IndexMap.");const s=[];let i=!1;const r=t.getIterator(C.Wrap);let o=r.getNext();for(;o;)i=i||e.isDefinedOn(o.node),s.push(o),o=r.getNext();let a;i?a=jt(s,e.getCompare()):a=Oe;const l=e.toString(),c=Object.assign({},this.indexSet_);c[l]=e;const d=Object.assign({},this.indexes_);return d[l]=a,new se(d,c)}addToIndexes(e,t){const s=Ft(this.indexes_,(i,r)=>{const o=Se(this.indexSet_,r);if(f(o,"Missing index implementation for "+r),i===Oe)if(o.isDefinedOn(e.node)){const a=[],l=t.getIterator(C.Wrap);let c=l.getNext();for(;c;)c.name!==e.name&&a.push(c),c=l.getNext();return a.push(e),jt(a,o.getCompare())}else return Oe;else{const a=t.get(e.name);let l=i;return a&&(l=l.remove(new C(e.name,a))),l.insert(e,e.node)}});return new se(s,this.indexSet_)}removeFromIndexes(e,t){const s=Ft(this.indexes_,i=>{if(i===Oe)return i;{const r=t.get(e.name);return r?i.remove(new C(e.name,r)):i}});return new se(s,this.indexSet_)}}/**
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
 */let tt;class m{static get EMPTY_NODE(){return tt||(tt=new m(new j(_s),null,se.Default))}constructor(e,t,s){this.children_=e,this.priorityNode_=t,this.indexMap_=s,this.lazyHash_=null,this.priorityNode_&&Pr(this.priorityNode_),this.children_.isEmpty()&&f(!this.priorityNode_||this.priorityNode_.isEmpty(),"An empty node cannot have a priority")}isLeafNode(){return!1}getPriority(){return this.priorityNode_||tt}updatePriority(e){return this.children_.isEmpty()?this:new m(this.children_,e,this.indexMap_)}getImmediateChild(e){if(e===".priority")return this.getPriority();{const t=this.children_.get(e);return t===null?tt:t}}getChild(e){const t=y(e);return t===null?this:this.getImmediateChild(t).getChild(N(e))}hasChild(e){return this.children_.get(e)!==null}updateImmediateChild(e,t){if(f(t,"We should always be passing snapshot nodes"),e===".priority")return this.updatePriority(t);{const s=new C(e,t);let i,r;t.isEmpty()?(i=this.children_.remove(e),r=this.indexMap_.removeFromIndexes(s,this.children_)):(i=this.children_.insert(e,t),r=this.indexMap_.addToIndexes(s,this.children_));const o=i.isEmpty()?tt:this.priorityNode_;return new m(i,o,r)}}updateChild(e,t){const s=y(e);if(s===null)return t;{f(y(e)!==".priority"||pe(e)===1,".priority must be the last token in a path");const i=this.getImmediateChild(s).updateChild(N(e),t);return this.updateImmediateChild(s,i)}}isEmpty(){return this.children_.isEmpty()}numChildren(){return this.children_.count()}val(e){if(this.isEmpty())return null;const t={};let s=0,i=0,r=!0;if(this.forEachChild(D,(o,a)=>{t[o]=a.val(e),s++,r&&m.INTEGER_REGEXP_.test(o)?i=Math.max(i,Number(o)):r=!1}),!e&&r&&i<2*s){const o=[];for(const a in t)o[a]=t[a];return o}else return e&&!this.getPriority().isEmpty()&&(t[".priority"]=this.getPriority().val()),t}hash(){if(this.lazyHash_===null){let e="";this.getPriority().isEmpty()||(e+="priority:"+Dr(this.getPriority().val())+":"),this.forEachChild(D,(t,s)=>{const i=s.hash();i!==""&&(e+=":"+t+":"+i)}),this.lazyHash_=e===""?"":ar(e)}return this.lazyHash_}getPredecessorChildName(e,t,s){const i=this.resolveIndex_(s);if(i){const r=i.getPredecessorKey(new C(e,t));return r?r.name:null}else return this.children_.getPredecessorKey(e)}getFirstChildName(e){const t=this.resolveIndex_(e);if(t){const s=t.minKey();return s&&s.name}else return this.children_.minKey()}getFirstChild(e){const t=this.getFirstChildName(e);return t?new C(t,this.children_.get(t)):null}getLastChildName(e){const t=this.resolveIndex_(e);if(t){const s=t.maxKey();return s&&s.name}else return this.children_.maxKey()}getLastChild(e){const t=this.getLastChildName(e);return t?new C(t,this.children_.get(t)):null}forEachChild(e,t){const s=this.resolveIndex_(e);return s?s.inorderTraversal(i=>t(i.name,i.node)):this.children_.inorderTraversal(t)}getIterator(e){return this.getIteratorFrom(e.minPost(),e)}getIteratorFrom(e,t){const s=this.resolveIndex_(t);if(s)return s.getIteratorFrom(e,i=>i);{const i=this.children_.getIteratorFrom(e.name,C.Wrap);let r=i.peek();for(;r!=null&&t.compare(r,e)<0;)i.getNext(),r=i.peek();return i}}getReverseIterator(e){return this.getReverseIteratorFrom(e.maxPost(),e)}getReverseIteratorFrom(e,t){const s=this.resolveIndex_(t);if(s)return s.getReverseIteratorFrom(e,i=>i);{const i=this.children_.getReverseIteratorFrom(e.name,C.Wrap);let r=i.peek();for(;r!=null&&t.compare(r,e)>0;)i.getNext(),r=i.peek();return i}}compareTo(e){return this.isEmpty()?e.isEmpty()?0:-1:e.isLeafNode()||e.isEmpty()?1:e===St?-1:0}withIndex(e){if(e===Be||this.indexMap_.hasIndex(e))return this;{const t=this.indexMap_.addIndex(e,this.children_);return new m(this.children_,this.priorityNode_,t)}}isIndexed(e){return e===Be||this.indexMap_.hasIndex(e)}equals(e){if(e===this)return!0;if(e.isLeafNode())return!1;{const t=e;if(this.getPriority().equals(t.getPriority()))if(this.children_.count()===t.children_.count()){const s=this.getIterator(D),i=t.getIterator(D);let r=s.getNext(),o=i.getNext();for(;r&&o;){if(r.name!==o.name||!r.node.equals(o.node))return!1;r=s.getNext(),o=i.getNext()}return r===null&&o===null}else return!1;else return!1}}resolveIndex_(e){return e===Be?null:this.indexMap_.get(e.toString())}}m.INTEGER_REGEXP_=/^(0|[1-9]\d*)$/;class Tc extends m{constructor(){super(new j(_s),m.EMPTY_NODE,se.Default)}compareTo(e){return e===this?0:1}equals(e){return e===this}getPriority(){return this}getImmediateChild(e){return m.EMPTY_NODE}isEmpty(){return!1}}const St=new Tc;Object.defineProperties(C,{MIN:{value:new C(Ue,m.EMPTY_NODE)},MAX:{value:new C(Te,St)}});Ar.__EMPTY_NODE=m.EMPTY_NODE;F.__childrenNodeConstructor=m;bc(St);wc(St);/**
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
 */const Rc=!0;function M(n,e=null){if(n===null)return m.EMPTY_NODE;if(typeof n=="object"&&".priority"in n&&(e=n[".priority"]),f(e===null||typeof e=="string"||typeof e=="number"||typeof e=="object"&&".sv"in e,"Invalid priority type found: "+typeof e),typeof n=="object"&&".value"in n&&n[".value"]!==null&&(n=n[".value"]),typeof n!="object"||".sv"in n){const t=n;return new F(t,M(e))}if(!(n instanceof Array)&&Rc){const t=[];let s=!1;if(W(n,(o,a)=>{if(o.substring(0,1)!=="."){const l=M(a);l.isEmpty()||(s=s||!l.getPriority().isEmpty(),t.push(new C(o,l)))}}),t.length===0)return m.EMPTY_NODE;const r=jt(t,yc,o=>o.name,_s);if(s){const o=jt(t,D.getCompare());return new m(r,M(e),new se({".priority":o},{".priority":D}))}else return new m(r,M(e),se.Default)}else{let t=m.EMPTY_NODE;return W(n,(s,i)=>{if(Z(n,s)&&s.substring(0,1)!=="."){const r=M(i);(r.isLeafNode()||!r.isEmpty())&&(t=t.updateImmediateChild(s,r))}}),t.updatePriority(M(e))}}Cc(M);/**
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
 */class Nc extends on{constructor(e){super(),this.indexPath_=e,f(!b(e)&&y(e)!==".priority","Can't create PathIndex with empty path or .priority key")}extractChild(e){return e.getChild(this.indexPath_)}isDefinedOn(e){return!e.getChild(this.indexPath_).isEmpty()}compare(e,t){const s=this.extractChild(e.node),i=this.extractChild(t.node),r=s.compareTo(i);return r===0?Ae(e.name,t.name):r}makePost(e,t){const s=M(e),i=m.EMPTY_NODE.updateChild(this.indexPath_,s);return new C(t,i)}maxPost(){const e=m.EMPTY_NODE.updateChild(this.indexPath_,St);return new C(Te,e)}toString(){return _t(this.indexPath_,0).join("/")}}/**
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
 */class kc extends on{compare(e,t){const s=e.node.compareTo(t.node);return s===0?Ae(e.name,t.name):s}isDefinedOn(e){return!0}indexedValueChanged(e,t){return!e.equals(t)}minPost(){return C.MIN}maxPost(){return C.MAX}makePost(e,t){const s=M(e);return new C(t,s)}toString(){return".value"}}const Ac=new kc;/**
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
 */function xr(n){return{type:"value",snapshotNode:n}}function je(n,e){return{type:"child_added",snapshotNode:e,childName:n}}function mt(n,e){return{type:"child_removed",snapshotNode:e,childName:n}}function gt(n,e,t){return{type:"child_changed",snapshotNode:e,childName:n,oldSnap:t}}function Dc(n,e){return{type:"child_moved",snapshotNode:e,childName:n}}/**
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
 */class ms{constructor(e){this.index_=e}updateChild(e,t,s,i,r,o){f(e.isIndexed(this.index_),"A node must be indexed if only a child is updated");const a=e.getImmediateChild(t);return a.getChild(i).equals(s.getChild(i))&&a.isEmpty()===s.isEmpty()||(o!=null&&(s.isEmpty()?e.hasChild(t)?o.trackChildChange(mt(t,a)):f(e.isLeafNode(),"A child remove without an old child only makes sense on a leaf node"):a.isEmpty()?o.trackChildChange(je(t,s)):o.trackChildChange(gt(t,s,a))),e.isLeafNode()&&s.isEmpty())?e:e.updateImmediateChild(t,s).withIndex(this.index_)}updateFullNode(e,t,s){return s!=null&&(e.isLeafNode()||e.forEachChild(D,(i,r)=>{t.hasChild(i)||s.trackChildChange(mt(i,r))}),t.isLeafNode()||t.forEachChild(D,(i,r)=>{if(e.hasChild(i)){const o=e.getImmediateChild(i);o.equals(r)||s.trackChildChange(gt(i,r,o))}else s.trackChildChange(je(i,r))})),t.withIndex(this.index_)}updatePriority(e,t){return e.isEmpty()?m.EMPTY_NODE:e.updatePriority(t)}filtersNodes(){return!1}getIndexedFilter(){return this}getIndex(){return this.index_}}/**
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
 */class vt{constructor(e){this.indexedFilter_=new ms(e.getIndex()),this.index_=e.getIndex(),this.startPost_=vt.getStartPost_(e),this.endPost_=vt.getEndPost_(e),this.startIsInclusive_=!e.startAfterSet_,this.endIsInclusive_=!e.endBeforeSet_}getStartPost(){return this.startPost_}getEndPost(){return this.endPost_}matches(e){const t=this.startIsInclusive_?this.index_.compare(this.getStartPost(),e)<=0:this.index_.compare(this.getStartPost(),e)<0,s=this.endIsInclusive_?this.index_.compare(e,this.getEndPost())<=0:this.index_.compare(e,this.getEndPost())<0;return t&&s}updateChild(e,t,s,i,r,o){return this.matches(new C(t,s))||(s=m.EMPTY_NODE),this.indexedFilter_.updateChild(e,t,s,i,r,o)}updateFullNode(e,t,s){t.isLeafNode()&&(t=m.EMPTY_NODE);let i=t.withIndex(this.index_);i=i.updatePriority(m.EMPTY_NODE);const r=this;return t.forEachChild(D,(o,a)=>{r.matches(new C(o,a))||(i=i.updateImmediateChild(o,m.EMPTY_NODE))}),this.indexedFilter_.updateFullNode(e,i,s)}updatePriority(e,t){return e}filtersNodes(){return!0}getIndexedFilter(){return this.indexedFilter_}getIndex(){return this.index_}static getStartPost_(e){if(e.hasStart()){const t=e.getIndexStartName();return e.getIndex().makePost(e.getIndexStartValue(),t)}else return e.getIndex().minPost()}static getEndPost_(e){if(e.hasEnd()){const t=e.getIndexEndName();return e.getIndex().makePost(e.getIndexEndValue(),t)}else return e.getIndex().maxPost()}}/**
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
 */class Pc{constructor(e){this.withinDirectionalStart=t=>this.reverse_?this.withinEndPost(t):this.withinStartPost(t),this.withinDirectionalEnd=t=>this.reverse_?this.withinStartPost(t):this.withinEndPost(t),this.withinStartPost=t=>{const s=this.index_.compare(this.rangedFilter_.getStartPost(),t);return this.startIsInclusive_?s<=0:s<0},this.withinEndPost=t=>{const s=this.index_.compare(t,this.rangedFilter_.getEndPost());return this.endIsInclusive_?s<=0:s<0},this.rangedFilter_=new vt(e),this.index_=e.getIndex(),this.limit_=e.getLimit(),this.reverse_=!e.isViewFromLeft(),this.startIsInclusive_=!e.startAfterSet_,this.endIsInclusive_=!e.endBeforeSet_}updateChild(e,t,s,i,r,o){return this.rangedFilter_.matches(new C(t,s))||(s=m.EMPTY_NODE),e.getImmediateChild(t).equals(s)?e:e.numChildren()<this.limit_?this.rangedFilter_.getIndexedFilter().updateChild(e,t,s,i,r,o):this.fullLimitUpdateChild_(e,t,s,r,o)}updateFullNode(e,t,s){let i;if(t.isLeafNode()||t.isEmpty())i=m.EMPTY_NODE.withIndex(this.index_);else if(this.limit_*2<t.numChildren()&&t.isIndexed(this.index_)){i=m.EMPTY_NODE.withIndex(this.index_);let r;this.reverse_?r=t.getReverseIteratorFrom(this.rangedFilter_.getEndPost(),this.index_):r=t.getIteratorFrom(this.rangedFilter_.getStartPost(),this.index_);let o=0;for(;r.hasNext()&&o<this.limit_;){const a=r.getNext();if(this.withinDirectionalStart(a))if(this.withinDirectionalEnd(a))i=i.updateImmediateChild(a.name,a.node),o++;else break;else continue}}else{i=t.withIndex(this.index_),i=i.updatePriority(m.EMPTY_NODE);let r;this.reverse_?r=i.getReverseIterator(this.index_):r=i.getIterator(this.index_);let o=0;for(;r.hasNext();){const a=r.getNext();o<this.limit_&&this.withinDirectionalStart(a)&&this.withinDirectionalEnd(a)?o++:i=i.updateImmediateChild(a.name,m.EMPTY_NODE)}}return this.rangedFilter_.getIndexedFilter().updateFullNode(e,i,s)}updatePriority(e,t){return e}filtersNodes(){return!0}getIndexedFilter(){return this.rangedFilter_.getIndexedFilter()}getIndex(){return this.index_}fullLimitUpdateChild_(e,t,s,i,r){let o;if(this.reverse_){const u=this.index_.getCompare();o=(h,p)=>u(p,h)}else o=this.index_.getCompare();const a=e;f(a.numChildren()===this.limit_,"");const l=new C(t,s),c=this.reverse_?a.getFirstChild(this.index_):a.getLastChild(this.index_),d=this.rangedFilter_.matches(l);if(a.hasChild(t)){const u=a.getImmediateChild(t);let h=i.getChildAfterChild(this.index_,c,this.reverse_);for(;h!=null&&(h.name===t||a.hasChild(h.name));)h=i.getChildAfterChild(this.index_,h,this.reverse_);const p=h==null?1:o(h,l);if(d&&!s.isEmpty()&&p>=0)return r!=null&&r.trackChildChange(gt(t,s,u)),a.updateImmediateChild(t,s);{r!=null&&r.trackChildChange(mt(t,u));const w=a.updateImmediateChild(t,m.EMPTY_NODE);return h!=null&&this.rangedFilter_.matches(h)?(r!=null&&r.trackChildChange(je(h.name,h.node)),w.updateImmediateChild(h.name,h.node)):w}}else return s.isEmpty()?e:d&&o(c,l)>=0?(r!=null&&(r.trackChildChange(mt(c.name,c.node)),r.trackChildChange(je(t,s))),a.updateImmediateChild(t,s).updateImmediateChild(c.name,m.EMPTY_NODE)):e}}/**
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
 */class gs{constructor(){this.limitSet_=!1,this.startSet_=!1,this.startNameSet_=!1,this.startAfterSet_=!1,this.endSet_=!1,this.endNameSet_=!1,this.endBeforeSet_=!1,this.limit_=0,this.viewFrom_="",this.indexStartValue_=null,this.indexStartName_="",this.indexEndValue_=null,this.indexEndName_="",this.index_=D}hasStart(){return this.startSet_}isViewFromLeft(){return this.viewFrom_===""?this.startSet_:this.viewFrom_==="l"}getIndexStartValue(){return f(this.startSet_,"Only valid if start has been set"),this.indexStartValue_}getIndexStartName(){return f(this.startSet_,"Only valid if start has been set"),this.startNameSet_?this.indexStartName_:Ue}hasEnd(){return this.endSet_}getIndexEndValue(){return f(this.endSet_,"Only valid if end has been set"),this.indexEndValue_}getIndexEndName(){return f(this.endSet_,"Only valid if end has been set"),this.endNameSet_?this.indexEndName_:Te}hasLimit(){return this.limitSet_}hasAnchoredLimit(){return this.limitSet_&&this.viewFrom_!==""}getLimit(){return f(this.limitSet_,"Only valid if limit has been set"),this.limit_}getIndex(){return this.index_}loadsAllData(){return!(this.startSet_||this.endSet_||this.limitSet_)}isDefault(){return this.loadsAllData()&&this.index_===D}copy(){const e=new gs;return e.limitSet_=this.limitSet_,e.limit_=this.limit_,e.startSet_=this.startSet_,e.startAfterSet_=this.startAfterSet_,e.indexStartValue_=this.indexStartValue_,e.startNameSet_=this.startNameSet_,e.indexStartName_=this.indexStartName_,e.endSet_=this.endSet_,e.endBeforeSet_=this.endBeforeSet_,e.indexEndValue_=this.indexEndValue_,e.endNameSet_=this.endNameSet_,e.indexEndName_=this.indexEndName_,e.index_=this.index_,e.viewFrom_=this.viewFrom_,e}}function Oc(n){return n.loadsAllData()?new ms(n.getIndex()):n.hasLimit()?new Pc(n):new vt(n)}function bi(n){const e={};if(n.isDefault())return e;let t;if(n.index_===D?t="$priority":n.index_===Ac?t="$value":n.index_===Be?t="$key":(f(n.index_ instanceof Nc,"Unrecognized index type!"),t=n.index_.toString()),e.orderBy=L(t),n.startSet_){const s=n.startAfterSet_?"startAfter":"startAt";e[s]=L(n.indexStartValue_),n.startNameSet_&&(e[s]+=","+L(n.indexStartName_))}if(n.endSet_){const s=n.endBeforeSet_?"endBefore":"endAt";e[s]=L(n.indexEndValue_),n.endNameSet_&&(e[s]+=","+L(n.indexEndName_))}return n.limitSet_&&(n.isViewFromLeft()?e.limitToFirst=n.limit_:e.limitToLast=n.limit_),e}function Ci(n){const e={};if(n.startSet_&&(e.sp=n.indexStartValue_,n.startNameSet_&&(e.sn=n.indexStartName_),e.sin=!n.startAfterSet_),n.endSet_&&(e.ep=n.indexEndValue_,n.endNameSet_&&(e.en=n.indexEndName_),e.ein=!n.endBeforeSet_),n.limitSet_){e.l=n.limit_;let t=n.viewFrom_;t===""&&(n.isViewFromLeft()?t="l":t="r"),e.vf=t}return n.index_!==D&&(e.i=n.index_.toString()),e}/**
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
 */class Vt extends Tr{reportStats(e){throw new Error("Method not implemented.")}static getListenId_(e,t){return t!==void 0?"tag$"+t:(f(e._queryParams.isDefault(),"should have a tag if it's not a default query."),e._path.toString())}constructor(e,t,s,i){super(),this.repoInfo_=e,this.onDataUpdate_=t,this.authTokenProvider_=s,this.appCheckTokenProvider_=i,this.log_=It("p:rest:"),this.listens_={}}listen(e,t,s,i){const r=e._path.toString();this.log_("Listen called for "+r+" "+e._queryIdentifier);const o=Vt.getListenId_(e,s),a={};this.listens_[o]=a;const l=bi(e._queryParams);this.restRequest_(r+".json",l,(c,d)=>{let u=d;if(c===404&&(u=null,c=null),c===null&&this.onDataUpdate_(r,u,!1,s),Se(this.listens_,o)===a){let h;c?c===401?h="permission_denied":h="rest_error:"+c:h="ok",i(h,null)}})}unlisten(e,t){const s=Vt.getListenId_(e,t);delete this.listens_[s]}get(e){const t=bi(e._queryParams),s=e._path.toString(),i=new K;return this.restRequest_(s+".json",t,(r,o)=>{let a=o;r===404&&(a=null,r=null),r===null?(this.onDataUpdate_(s,a,!1,null),i.resolve(a)):i.reject(new Error(a))}),i.promise}refreshAuthToken(e){}restRequest_(e,t={},s){return t.format="export",Promise.all([this.authTokenProvider_.getToken(!1),this.appCheckTokenProvider_.getToken(!1)]).then(([i,r])=>{i&&i.accessToken&&(t.auth=i.accessToken),r&&r.token&&(t.ac=r.token);const o=(this.repoInfo_.secure?"https://":"http://")+this.repoInfo_.host+e+"?ns="+this.repoInfo_.namespace+oa(t);this.log_("Sending REST request for "+o);const a=new XMLHttpRequest;a.onreadystatechange=()=>{if(s&&a.readyState===4){this.log_("REST Response for "+o+" received. status:",a.status,"response:",a.responseText);let l=null;if(a.status>=200&&a.status<300){try{l=ht(a.responseText)}catch{U("Failed to parse JSON response for "+o+": "+a.responseText)}s(null,l)}else a.status!==401&&a.status!==404&&U("Got unsuccessful REST response for "+o+" Status: "+a.status),s(a.status);s=null}},a.open("GET",o,!0),a.send()})}}/**
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
 */class Mc{constructor(){this.rootNode_=m.EMPTY_NODE}getNode(e){return this.rootNode_.getChild(e)}updateSnapshot(e,t){this.rootNode_=this.rootNode_.updateChild(e,t)}}/**
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
 */function qt(){return{value:null,children:new Map}}function Qe(n,e,t){if(b(e))n.value=t,n.children.clear();else if(n.value!==null)n.value=n.value.updateChild(e,t);else{const s=y(e);n.children.has(s)||n.children.set(s,qt());const i=n.children.get(s);e=N(e),Qe(i,e,t)}}function Gn(n,e){if(b(e))return n.value=null,n.children.clear(),!0;if(n.value!==null){if(n.value.isLeafNode())return!1;{const t=n.value;return n.value=null,t.forEachChild(D,(s,i)=>{Qe(n,new S(s),i)}),Gn(n,e)}}else if(n.children.size>0){const t=y(e);return e=N(e),n.children.has(t)&&Gn(n.children.get(t),e)&&n.children.delete(t),n.children.size===0}else return!0}function zn(n,e,t){n.value!==null?t(e,n.value):xc(n,(s,i)=>{const r=new S(e.toString()+"/"+s);zn(i,r,t)})}function xc(n,e){n.children.forEach((t,s)=>{e(s,t)})}/**
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
 */class Lc{constructor(e){this.collection_=e,this.last_=null}get(){const e=this.collection_.get(),t=Object.assign({},e);return this.last_&&W(this.last_,(s,i)=>{t[s]=t[s]-i}),this.last_=e,t}}/**
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
 */const wi=10*1e3,Fc=30*1e3,$c=300*1e3;class Bc{constructor(e,t){this.server_=t,this.statsToReport_={},this.statsListener_=new Lc(e);const s=wi+(Fc-wi)*Math.random();rt(this.reportStats_.bind(this),Math.floor(s))}reportStats_(){const e=this.statsListener_.get(),t={};let s=!1;W(e,(i,r)=>{r>0&&Z(this.statsToReport_,i)&&(t[i]=r,s=!0)}),s&&this.server_.reportStats(t),rt(this.reportStats_.bind(this),Math.floor(Math.random()*2*$c))}}/**
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
 */var X;(function(n){n[n.OVERWRITE=0]="OVERWRITE",n[n.MERGE=1]="MERGE",n[n.ACK_USER_WRITE=2]="ACK_USER_WRITE",n[n.LISTEN_COMPLETE=3]="LISTEN_COMPLETE"})(X||(X={}));function vs(){return{fromUser:!0,fromServer:!1,queryId:null,tagged:!1}}function ys(){return{fromUser:!1,fromServer:!0,queryId:null,tagged:!1}}function bs(n){return{fromUser:!1,fromServer:!0,queryId:n,tagged:!0}}/**
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
 */class Gt{constructor(e,t,s){this.path=e,this.affectedTree=t,this.revert=s,this.type=X.ACK_USER_WRITE,this.source=vs()}operationForChild(e){if(b(this.path)){if(this.affectedTree.value!=null)return f(this.affectedTree.children.isEmpty(),"affectedTree should not have overlapping affected paths."),this;{const t=this.affectedTree.subtree(new S(e));return new Gt(E(),t,this.revert)}}else return f(y(this.path)===e,"operationForChild called for unrelated child."),new Gt(N(this.path),this.affectedTree,this.revert)}}/**
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
 */class yt{constructor(e,t){this.source=e,this.path=t,this.type=X.LISTEN_COMPLETE}operationForChild(e){return b(this.path)?new yt(this.source,E()):new yt(this.source,N(this.path))}}/**
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
 */class Re{constructor(e,t,s){this.source=e,this.path=t,this.snap=s,this.type=X.OVERWRITE}operationForChild(e){return b(this.path)?new Re(this.source,E(),this.snap.getImmediateChild(e)):new Re(this.source,N(this.path),this.snap)}}/**
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
 */class Ve{constructor(e,t,s){this.source=e,this.path=t,this.children=s,this.type=X.MERGE}operationForChild(e){if(b(this.path)){const t=this.children.subtree(new S(e));return t.isEmpty()?null:t.value?new Re(this.source,E(),t.value):new Ve(this.source,E(),t)}else return f(y(this.path)===e,"Can't get a merge for a child not on the path of the operation"),new Ve(this.source,N(this.path),this.children)}toString(){return"Operation("+this.path+": "+this.source.toString()+" merge: "+this.children.toString()+")"}}/**
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
 */class _e{constructor(e,t,s){this.node_=e,this.fullyInitialized_=t,this.filtered_=s}isFullyInitialized(){return this.fullyInitialized_}isFiltered(){return this.filtered_}isCompleteForPath(e){if(b(e))return this.isFullyInitialized()&&!this.filtered_;const t=y(e);return this.isCompleteForChild(t)}isCompleteForChild(e){return this.isFullyInitialized()&&!this.filtered_||this.node_.hasChild(e)}getNode(){return this.node_}}/**
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
 */class Wc{constructor(e){this.query_=e,this.index_=this.query_._queryParams.getIndex()}}function Hc(n,e,t,s){const i=[],r=[];return e.forEach(o=>{o.type==="child_changed"&&n.index_.indexedValueChanged(o.oldSnap,o.snapshotNode)&&r.push(Dc(o.childName,o.snapshotNode))}),nt(n,i,"child_removed",e,s,t),nt(n,i,"child_added",e,s,t),nt(n,i,"child_moved",r,s,t),nt(n,i,"child_changed",e,s,t),nt(n,i,"value",e,s,t),i}function nt(n,e,t,s,i,r){const o=s.filter(a=>a.type===t);o.sort((a,l)=>jc(n,a,l)),o.forEach(a=>{const l=Uc(n,a,r);i.forEach(c=>{c.respondsTo(a.type)&&e.push(c.createEvent(l,n.query_))})})}function Uc(n,e,t){return e.type==="value"||e.type==="child_removed"||(e.prevName=t.getPredecessorChildName(e.childName,e.snapshotNode,n.index_)),e}function jc(n,e,t){if(e.childName==null||t.childName==null)throw Ye("Should only compare child_ events.");const s=new C(e.childName,e.snapshotNode),i=new C(t.childName,t.snapshotNode);return n.index_.compare(s,i)}/**
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
 */function an(n,e){return{eventCache:n,serverCache:e}}function ot(n,e,t,s){return an(new _e(e,t,s),n.serverCache)}function Lr(n,e,t,s){return an(n.eventCache,new _e(e,t,s))}function zt(n){return n.eventCache.isFullyInitialized()?n.eventCache.getNode():null}function Ne(n){return n.serverCache.isFullyInitialized()?n.serverCache.getNode():null}/**
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
 */let An;const Vc=()=>(An||(An=new j(Nl)),An);class k{static fromObject(e){let t=new k(null);return W(e,(s,i)=>{t=t.set(new S(s),i)}),t}constructor(e,t=Vc()){this.value=e,this.children=t}isEmpty(){return this.value===null&&this.children.isEmpty()}findRootMostMatchingPathAndValue(e,t){if(this.value!=null&&t(this.value))return{path:E(),value:this.value};if(b(e))return null;{const s=y(e),i=this.children.get(s);if(i!==null){const r=i.findRootMostMatchingPathAndValue(N(e),t);return r!=null?{path:x(new S(s),r.path),value:r.value}:null}else return null}}findRootMostValueAndPath(e){return this.findRootMostMatchingPathAndValue(e,()=>!0)}subtree(e){if(b(e))return this;{const t=y(e),s=this.children.get(t);return s!==null?s.subtree(N(e)):new k(null)}}set(e,t){if(b(e))return new k(t,this.children);{const s=y(e),r=(this.children.get(s)||new k(null)).set(N(e),t),o=this.children.insert(s,r);return new k(this.value,o)}}remove(e){if(b(e))return this.children.isEmpty()?new k(null):new k(null,this.children);{const t=y(e),s=this.children.get(t);if(s){const i=s.remove(N(e));let r;return i.isEmpty()?r=this.children.remove(t):r=this.children.insert(t,i),this.value===null&&r.isEmpty()?new k(null):new k(this.value,r)}else return this}}get(e){if(b(e))return this.value;{const t=y(e),s=this.children.get(t);return s?s.get(N(e)):null}}setTree(e,t){if(b(e))return t;{const s=y(e),r=(this.children.get(s)||new k(null)).setTree(N(e),t);let o;return r.isEmpty()?o=this.children.remove(s):o=this.children.insert(s,r),new k(this.value,o)}}fold(e){return this.fold_(E(),e)}fold_(e,t){const s={};return this.children.inorderTraversal((i,r)=>{s[i]=r.fold_(x(e,i),t)}),t(e,this.value,s)}findOnPath(e,t){return this.findOnPath_(e,E(),t)}findOnPath_(e,t,s){const i=this.value?s(t,this.value):!1;if(i)return i;if(b(e))return null;{const r=y(e),o=this.children.get(r);return o?o.findOnPath_(N(e),x(t,r),s):null}}foreachOnPath(e,t){return this.foreachOnPath_(e,E(),t)}foreachOnPath_(e,t,s){if(b(e))return this;{this.value&&s(t,this.value);const i=y(e),r=this.children.get(i);return r?r.foreachOnPath_(N(e),x(t,i),s):new k(null)}}foreach(e){this.foreach_(E(),e)}foreach_(e,t){this.children.inorderTraversal((s,i)=>{i.foreach_(x(e,s),t)}),this.value&&t(e,this.value)}foreachChild(e){this.children.inorderTraversal((t,s)=>{s.value&&e(t,s.value)})}}/**
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
 */class J{constructor(e){this.writeTree_=e}static empty(){return new J(new k(null))}}function at(n,e,t){if(b(e))return new J(new k(t));{const s=n.writeTree_.findRootMostValueAndPath(e);if(s!=null){const i=s.path;let r=s.value;const o=H(i,e);return r=r.updateChild(o,t),new J(n.writeTree_.set(i,r))}else{const i=new k(t),r=n.writeTree_.setTree(e,i);return new J(r)}}}function Yn(n,e,t){let s=n;return W(t,(i,r)=>{s=at(s,x(e,i),r)}),s}function Ei(n,e){if(b(e))return J.empty();{const t=n.writeTree_.setTree(e,new k(null));return new J(t)}}function Kn(n,e){return De(n,e)!=null}function De(n,e){const t=n.writeTree_.findRootMostValueAndPath(e);return t!=null?n.writeTree_.get(t.path).getChild(H(t.path,e)):null}function Ii(n){const e=[],t=n.writeTree_.value;return t!=null?t.isLeafNode()||t.forEachChild(D,(s,i)=>{e.push(new C(s,i))}):n.writeTree_.children.inorderTraversal((s,i)=>{i.value!=null&&e.push(new C(s,i.value))}),e}function de(n,e){if(b(e))return n;{const t=De(n,e);return t!=null?new J(new k(t)):new J(n.writeTree_.subtree(e))}}function Qn(n){return n.writeTree_.isEmpty()}function qe(n,e){return Fr(E(),n.writeTree_,e)}function Fr(n,e,t){if(e.value!=null)return t.updateChild(n,e.value);{let s=null;return e.children.inorderTraversal((i,r)=>{i===".priority"?(f(r.value!==null,"Priority writes must always be leaf nodes"),s=r.value):t=Fr(x(n,i),r,t)}),!t.getChild(n).isEmpty()&&s!==null&&(t=t.updateChild(x(n,".priority"),s)),t}}/**
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
 */function ln(n,e){return Hr(e,n)}function qc(n,e,t,s,i){f(s>n.lastWriteId,"Stacking an older write on top of newer ones"),i===void 0&&(i=!0),n.allWrites.push({path:e,snap:t,writeId:s,visible:i}),i&&(n.visibleWrites=at(n.visibleWrites,e,t)),n.lastWriteId=s}function Gc(n,e,t,s){f(s>n.lastWriteId,"Stacking an older merge on top of newer ones"),n.allWrites.push({path:e,children:t,writeId:s,visible:!0}),n.visibleWrites=Yn(n.visibleWrites,e,t),n.lastWriteId=s}function zc(n,e){for(let t=0;t<n.allWrites.length;t++){const s=n.allWrites[t];if(s.writeId===e)return s}return null}function Yc(n,e){const t=n.allWrites.findIndex(a=>a.writeId===e);f(t>=0,"removeWrite called with nonexistent writeId.");const s=n.allWrites[t];n.allWrites.splice(t,1);let i=s.visible,r=!1,o=n.allWrites.length-1;for(;i&&o>=0;){const a=n.allWrites[o];a.visible&&(o>=t&&Kc(a,s.path)?i=!1:q(s.path,a.path)&&(r=!0)),o--}if(i){if(r)return Qc(n),!0;if(s.snap)n.visibleWrites=Ei(n.visibleWrites,s.path);else{const a=s.children;W(a,l=>{n.visibleWrites=Ei(n.visibleWrites,x(s.path,l))})}return!0}else return!1}function Kc(n,e){if(n.snap)return q(n.path,e);for(const t in n.children)if(n.children.hasOwnProperty(t)&&q(x(n.path,t),e))return!0;return!1}function Qc(n){n.visibleWrites=$r(n.allWrites,Xc,E()),n.allWrites.length>0?n.lastWriteId=n.allWrites[n.allWrites.length-1].writeId:n.lastWriteId=-1}function Xc(n){return n.visible}function $r(n,e,t){let s=J.empty();for(let i=0;i<n.length;++i){const r=n[i];if(e(r)){const o=r.path;let a;if(r.snap)q(t,o)?(a=H(t,o),s=at(s,a,r.snap)):q(o,t)&&(a=H(o,t),s=at(s,E(),r.snap.getChild(a)));else if(r.children){if(q(t,o))a=H(t,o),s=Yn(s,a,r.children);else if(q(o,t))if(a=H(o,t),b(a))s=Yn(s,E(),r.children);else{const l=Se(r.children,y(a));if(l){const c=l.getChild(N(a));s=at(s,E(),c)}}}else throw Ye("WriteRecord should have .snap or .children")}}return s}function Br(n,e,t,s,i){if(!s&&!i){const r=De(n.visibleWrites,e);if(r!=null)return r;{const o=de(n.visibleWrites,e);if(Qn(o))return t;if(t==null&&!Kn(o,E()))return null;{const a=t||m.EMPTY_NODE;return qe(o,a)}}}else{const r=de(n.visibleWrites,e);if(!i&&Qn(r))return t;if(!i&&t==null&&!Kn(r,E()))return null;{const o=function(c){return(c.visible||i)&&(!s||!~s.indexOf(c.writeId))&&(q(c.path,e)||q(e,c.path))},a=$r(n.allWrites,o,e),l=t||m.EMPTY_NODE;return qe(a,l)}}}function Jc(n,e,t){let s=m.EMPTY_NODE;const i=De(n.visibleWrites,e);if(i)return i.isLeafNode()||i.forEachChild(D,(r,o)=>{s=s.updateImmediateChild(r,o)}),s;if(t){const r=de(n.visibleWrites,e);return t.forEachChild(D,(o,a)=>{const l=qe(de(r,new S(o)),a);s=s.updateImmediateChild(o,l)}),Ii(r).forEach(o=>{s=s.updateImmediateChild(o.name,o.node)}),s}else{const r=de(n.visibleWrites,e);return Ii(r).forEach(o=>{s=s.updateImmediateChild(o.name,o.node)}),s}}function Zc(n,e,t,s,i){f(s||i,"Either existingEventSnap or existingServerSnap must exist");const r=x(e,t);if(Kn(n.visibleWrites,r))return null;{const o=de(n.visibleWrites,r);return Qn(o)?i.getChild(t):qe(o,i.getChild(t))}}function eu(n,e,t,s){const i=x(e,t),r=De(n.visibleWrites,i);if(r!=null)return r;if(s.isCompleteForChild(t)){const o=de(n.visibleWrites,i);return qe(o,s.getNode().getImmediateChild(t))}else return null}function tu(n,e){return De(n.visibleWrites,e)}function nu(n,e,t,s,i,r,o){let a;const l=de(n.visibleWrites,e),c=De(l,E());if(c!=null)a=c;else if(t!=null)a=qe(l,t);else return[];if(a=a.withIndex(o),!a.isEmpty()&&!a.isLeafNode()){const d=[],u=o.getCompare(),h=r?a.getReverseIteratorFrom(s,o):a.getIteratorFrom(s,o);let p=h.getNext();for(;p&&d.length<i;)u(p,s)!==0&&d.push(p),p=h.getNext();return d}else return[]}function su(){return{visibleWrites:J.empty(),allWrites:[],lastWriteId:-1}}function Yt(n,e,t,s){return Br(n.writeTree,n.treePath,e,t,s)}function Cs(n,e){return Jc(n.writeTree,n.treePath,e)}function Si(n,e,t,s){return Zc(n.writeTree,n.treePath,e,t,s)}function Kt(n,e){return tu(n.writeTree,x(n.treePath,e))}function iu(n,e,t,s,i,r){return nu(n.writeTree,n.treePath,e,t,s,i,r)}function ws(n,e,t){return eu(n.writeTree,n.treePath,e,t)}function Wr(n,e){return Hr(x(n.treePath,e),n.writeTree)}function Hr(n,e){return{treePath:n,writeTree:e}}/**
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
 */class ru{constructor(){this.changeMap=new Map}trackChildChange(e){const t=e.type,s=e.childName;f(t==="child_added"||t==="child_changed"||t==="child_removed","Only child changes supported for tracking"),f(s!==".priority","Only non-priority child changes can be tracked.");const i=this.changeMap.get(s);if(i){const r=i.type;if(t==="child_added"&&r==="child_removed")this.changeMap.set(s,gt(s,e.snapshotNode,i.snapshotNode));else if(t==="child_removed"&&r==="child_added")this.changeMap.delete(s);else if(t==="child_removed"&&r==="child_changed")this.changeMap.set(s,mt(s,i.oldSnap));else if(t==="child_changed"&&r==="child_added")this.changeMap.set(s,je(s,e.snapshotNode));else if(t==="child_changed"&&r==="child_changed")this.changeMap.set(s,gt(s,e.snapshotNode,i.oldSnap));else throw Ye("Illegal combination of changes: "+e+" occurred after "+i)}else this.changeMap.set(s,e)}getChanges(){return Array.from(this.changeMap.values())}}/**
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
 */class ou{getCompleteChild(e){return null}getChildAfterChild(e,t,s){return null}}const Ur=new ou;class Es{constructor(e,t,s=null){this.writes_=e,this.viewCache_=t,this.optCompleteServerCache_=s}getCompleteChild(e){const t=this.viewCache_.eventCache;if(t.isCompleteForChild(e))return t.getNode().getImmediateChild(e);{const s=this.optCompleteServerCache_!=null?new _e(this.optCompleteServerCache_,!0,!1):this.viewCache_.serverCache;return ws(this.writes_,e,s)}}getChildAfterChild(e,t,s){const i=this.optCompleteServerCache_!=null?this.optCompleteServerCache_:Ne(this.viewCache_),r=iu(this.writes_,i,t,1,s,e);return r.length===0?null:r[0]}}/**
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
 */function au(n){return{filter:n}}function lu(n,e){f(e.eventCache.getNode().isIndexed(n.filter.getIndex()),"Event snap not indexed"),f(e.serverCache.getNode().isIndexed(n.filter.getIndex()),"Server snap not indexed")}function cu(n,e,t,s,i){const r=new ru;let o,a;if(t.type===X.OVERWRITE){const c=t;c.source.fromUser?o=Xn(n,e,c.path,c.snap,s,i,r):(f(c.source.fromServer,"Unknown source."),a=c.source.tagged||e.serverCache.isFiltered()&&!b(c.path),o=Qt(n,e,c.path,c.snap,s,i,a,r))}else if(t.type===X.MERGE){const c=t;c.source.fromUser?o=hu(n,e,c.path,c.children,s,i,r):(f(c.source.fromServer,"Unknown source."),a=c.source.tagged||e.serverCache.isFiltered(),o=Jn(n,e,c.path,c.children,s,i,a,r))}else if(t.type===X.ACK_USER_WRITE){const c=t;c.revert?o=pu(n,e,c.path,s,i,r):o=du(n,e,c.path,c.affectedTree,s,i,r)}else if(t.type===X.LISTEN_COMPLETE)o=fu(n,e,t.path,s,r);else throw Ye("Unknown operation type: "+t.type);const l=r.getChanges();return uu(e,o,l),{viewCache:o,changes:l}}function uu(n,e,t){const s=e.eventCache;if(s.isFullyInitialized()){const i=s.getNode().isLeafNode()||s.getNode().isEmpty(),r=zt(n);(t.length>0||!n.eventCache.isFullyInitialized()||i&&!s.getNode().equals(r)||!s.getNode().getPriority().equals(r.getPriority()))&&t.push(xr(zt(e)))}}function jr(n,e,t,s,i,r){const o=e.eventCache;if(Kt(s,t)!=null)return e;{let a,l;if(b(t))if(f(e.serverCache.isFullyInitialized(),"If change path is empty, we must have complete server data"),e.serverCache.isFiltered()){const c=Ne(e),d=c instanceof m?c:m.EMPTY_NODE,u=Cs(s,d);a=n.filter.updateFullNode(e.eventCache.getNode(),u,r)}else{const c=Yt(s,Ne(e));a=n.filter.updateFullNode(e.eventCache.getNode(),c,r)}else{const c=y(t);if(c===".priority"){f(pe(t)===1,"Can't have a priority with additional path components");const d=o.getNode();l=e.serverCache.getNode();const u=Si(s,t,d,l);u!=null?a=n.filter.updatePriority(d,u):a=o.getNode()}else{const d=N(t);let u;if(o.isCompleteForChild(c)){l=e.serverCache.getNode();const h=Si(s,t,o.getNode(),l);h!=null?u=o.getNode().getImmediateChild(c).updateChild(d,h):u=o.getNode().getImmediateChild(c)}else u=ws(s,c,e.serverCache);u!=null?a=n.filter.updateChild(o.getNode(),c,u,d,i,r):a=o.getNode()}}return ot(e,a,o.isFullyInitialized()||b(t),n.filter.filtersNodes())}}function Qt(n,e,t,s,i,r,o,a){const l=e.serverCache;let c;const d=o?n.filter:n.filter.getIndexedFilter();if(b(t))c=d.updateFullNode(l.getNode(),s,null);else if(d.filtersNodes()&&!l.isFiltered()){const p=l.getNode().updateChild(t,s);c=d.updateFullNode(l.getNode(),p,null)}else{const p=y(t);if(!l.isCompleteForPath(t)&&pe(t)>1)return e;const _=N(t),P=l.getNode().getImmediateChild(p).updateChild(_,s);p===".priority"?c=d.updatePriority(l.getNode(),P):c=d.updateChild(l.getNode(),p,P,_,Ur,null)}const u=Lr(e,c,l.isFullyInitialized()||b(t),d.filtersNodes()),h=new Es(i,u,r);return jr(n,u,t,i,h,a)}function Xn(n,e,t,s,i,r,o){const a=e.eventCache;let l,c;const d=new Es(i,e,r);if(b(t))c=n.filter.updateFullNode(e.eventCache.getNode(),s,o),l=ot(e,c,!0,n.filter.filtersNodes());else{const u=y(t);if(u===".priority")c=n.filter.updatePriority(e.eventCache.getNode(),s),l=ot(e,c,a.isFullyInitialized(),a.isFiltered());else{const h=N(t),p=a.getNode().getImmediateChild(u);let _;if(b(h))_=s;else{const w=d.getCompleteChild(u);w!=null?ds(h)===".priority"&&w.getChild(Nr(h)).isEmpty()?_=w:_=w.updateChild(h,s):_=m.EMPTY_NODE}if(p.equals(_))l=e;else{const w=n.filter.updateChild(a.getNode(),u,_,h,d,o);l=ot(e,w,a.isFullyInitialized(),n.filter.filtersNodes())}}}return l}function Ti(n,e){return n.eventCache.isCompleteForChild(e)}function hu(n,e,t,s,i,r,o){let a=e;return s.foreach((l,c)=>{const d=x(t,l);Ti(e,y(d))&&(a=Xn(n,a,d,c,i,r,o))}),s.foreach((l,c)=>{const d=x(t,l);Ti(e,y(d))||(a=Xn(n,a,d,c,i,r,o))}),a}function Ri(n,e,t){return t.foreach((s,i)=>{e=e.updateChild(s,i)}),e}function Jn(n,e,t,s,i,r,o,a){if(e.serverCache.getNode().isEmpty()&&!e.serverCache.isFullyInitialized())return e;let l=e,c;b(t)?c=s:c=new k(null).setTree(t,s);const d=e.serverCache.getNode();return c.children.inorderTraversal((u,h)=>{if(d.hasChild(u)){const p=e.serverCache.getNode().getImmediateChild(u),_=Ri(n,p,h);l=Qt(n,l,new S(u),_,i,r,o,a)}}),c.children.inorderTraversal((u,h)=>{const p=!e.serverCache.isCompleteForChild(u)&&h.value===null;if(!d.hasChild(u)&&!p){const _=e.serverCache.getNode().getImmediateChild(u),w=Ri(n,_,h);l=Qt(n,l,new S(u),w,i,r,o,a)}}),l}function du(n,e,t,s,i,r,o){if(Kt(i,t)!=null)return e;const a=e.serverCache.isFiltered(),l=e.serverCache;if(s.value!=null){if(b(t)&&l.isFullyInitialized()||l.isCompleteForPath(t))return Qt(n,e,t,l.getNode().getChild(t),i,r,a,o);if(b(t)){let c=new k(null);return l.getNode().forEachChild(Be,(d,u)=>{c=c.set(new S(d),u)}),Jn(n,e,t,c,i,r,a,o)}else return e}else{let c=new k(null);return s.foreach((d,u)=>{const h=x(t,d);l.isCompleteForPath(h)&&(c=c.set(d,l.getNode().getChild(h)))}),Jn(n,e,t,c,i,r,a,o)}}function fu(n,e,t,s,i){const r=e.serverCache,o=Lr(e,r.getNode(),r.isFullyInitialized()||b(t),r.isFiltered());return jr(n,o,t,s,Ur,i)}function pu(n,e,t,s,i,r){let o;if(Kt(s,t)!=null)return e;{const a=new Es(s,e,i),l=e.eventCache.getNode();let c;if(b(t)||y(t)===".priority"){let d;if(e.serverCache.isFullyInitialized())d=Yt(s,Ne(e));else{const u=e.serverCache.getNode();f(u instanceof m,"serverChildren would be complete if leaf node"),d=Cs(s,u)}d=d,c=n.filter.updateFullNode(l,d,r)}else{const d=y(t);let u=ws(s,d,e.serverCache);u==null&&e.serverCache.isCompleteForChild(d)&&(u=l.getImmediateChild(d)),u!=null?c=n.filter.updateChild(l,d,u,N(t),a,r):e.eventCache.getNode().hasChild(d)?c=n.filter.updateChild(l,d,m.EMPTY_NODE,N(t),a,r):c=l,c.isEmpty()&&e.serverCache.isFullyInitialized()&&(o=Yt(s,Ne(e)),o.isLeafNode()&&(c=n.filter.updateFullNode(c,o,r)))}return o=e.serverCache.isFullyInitialized()||Kt(s,E())!=null,ot(e,c,o,n.filter.filtersNodes())}}/**
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
 */class _u{constructor(e,t){this.query_=e,this.eventRegistrations_=[];const s=this.query_._queryParams,i=new ms(s.getIndex()),r=Oc(s);this.processor_=au(r);const o=t.serverCache,a=t.eventCache,l=i.updateFullNode(m.EMPTY_NODE,o.getNode(),null),c=r.updateFullNode(m.EMPTY_NODE,a.getNode(),null),d=new _e(l,o.isFullyInitialized(),i.filtersNodes()),u=new _e(c,a.isFullyInitialized(),r.filtersNodes());this.viewCache_=an(u,d),this.eventGenerator_=new Wc(this.query_)}get query(){return this.query_}}function mu(n){return n.viewCache_.serverCache.getNode()}function gu(n){return zt(n.viewCache_)}function vu(n,e){const t=Ne(n.viewCache_);return t&&(n.query._queryParams.loadsAllData()||!b(e)&&!t.getImmediateChild(y(e)).isEmpty())?t.getChild(e):null}function Ni(n){return n.eventRegistrations_.length===0}function yu(n,e){n.eventRegistrations_.push(e)}function ki(n,e,t){const s=[];if(t){f(e==null,"A cancel should cancel all event registrations.");const i=n.query._path;n.eventRegistrations_.forEach(r=>{const o=r.createCancelEvent(t,i);o&&s.push(o)})}if(e){let i=[];for(let r=0;r<n.eventRegistrations_.length;++r){const o=n.eventRegistrations_[r];if(!o.matches(e))i.push(o);else if(e.hasAnyCallback()){i=i.concat(n.eventRegistrations_.slice(r+1));break}}n.eventRegistrations_=i}else n.eventRegistrations_=[];return s}function Ai(n,e,t,s){e.type===X.MERGE&&e.source.queryId!==null&&(f(Ne(n.viewCache_),"We should always have a full cache before handling merges"),f(zt(n.viewCache_),"Missing event cache, even though we have a server cache"));const i=n.viewCache_,r=cu(n.processor_,i,e,t,s);return lu(n.processor_,r.viewCache),f(r.viewCache.serverCache.isFullyInitialized()||!i.serverCache.isFullyInitialized(),"Once a server snap is complete, it should never go back"),n.viewCache_=r.viewCache,Vr(n,r.changes,r.viewCache.eventCache.getNode(),null)}function bu(n,e){const t=n.viewCache_.eventCache,s=[];return t.getNode().isLeafNode()||t.getNode().forEachChild(D,(r,o)=>{s.push(je(r,o))}),t.isFullyInitialized()&&s.push(xr(t.getNode())),Vr(n,s,t.getNode(),e)}function Vr(n,e,t,s){const i=s?[s]:n.eventRegistrations_;return Hc(n.eventGenerator_,e,t,i)}/**
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
 */let Xt;class qr{constructor(){this.views=new Map}}function Cu(n){f(!Xt,"__referenceConstructor has already been defined"),Xt=n}function wu(){return f(Xt,"Reference.ts has not been loaded"),Xt}function Eu(n){return n.views.size===0}function Is(n,e,t,s){const i=e.source.queryId;if(i!==null){const r=n.views.get(i);return f(r!=null,"SyncTree gave us an op for an invalid query."),Ai(r,e,t,s)}else{let r=[];for(const o of n.views.values())r=r.concat(Ai(o,e,t,s));return r}}function Gr(n,e,t,s,i){const r=e._queryIdentifier,o=n.views.get(r);if(!o){let a=Yt(t,i?s:null),l=!1;a?l=!0:s instanceof m?(a=Cs(t,s),l=!1):(a=m.EMPTY_NODE,l=!1);const c=an(new _e(a,l,!1),new _e(s,i,!1));return new _u(e,c)}return o}function Iu(n,e,t,s,i,r){const o=Gr(n,e,s,i,r);return n.views.has(e._queryIdentifier)||n.views.set(e._queryIdentifier,o),yu(o,t),bu(o,t)}function Su(n,e,t,s){const i=e._queryIdentifier,r=[];let o=[];const a=me(n);if(i==="default")for(const[l,c]of n.views.entries())o=o.concat(ki(c,t,s)),Ni(c)&&(n.views.delete(l),c.query._queryParams.loadsAllData()||r.push(c.query));else{const l=n.views.get(i);l&&(o=o.concat(ki(l,t,s)),Ni(l)&&(n.views.delete(i),l.query._queryParams.loadsAllData()||r.push(l.query)))}return a&&!me(n)&&r.push(new(wu())(e._repo,e._path)),{removed:r,events:o}}function zr(n){const e=[];for(const t of n.views.values())t.query._queryParams.loadsAllData()||e.push(t);return e}function fe(n,e){let t=null;for(const s of n.views.values())t=t||vu(s,e);return t}function Yr(n,e){if(e._queryParams.loadsAllData())return cn(n);{const s=e._queryIdentifier;return n.views.get(s)}}function Kr(n,e){return Yr(n,e)!=null}function me(n){return cn(n)!=null}function cn(n){for(const e of n.views.values())if(e.query._queryParams.loadsAllData())return e;return null}/**
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
 */let Jt;function Tu(n){f(!Jt,"__referenceConstructor has already been defined"),Jt=n}function Ru(){return f(Jt,"Reference.ts has not been loaded"),Jt}let Nu=1;class Di{constructor(e){this.listenProvider_=e,this.syncPointTree_=new k(null),this.pendingWriteTree_=su(),this.tagToQueryMap=new Map,this.queryToTagMap=new Map}}function Ss(n,e,t,s,i){return qc(n.pendingWriteTree_,e,t,s,i),i?Xe(n,new Re(vs(),e,t)):[]}function ku(n,e,t,s){Gc(n.pendingWriteTree_,e,t,s);const i=k.fromObject(t);return Xe(n,new Ve(vs(),e,i))}function ce(n,e,t=!1){const s=zc(n.pendingWriteTree_,e);if(Yc(n.pendingWriteTree_,e)){let r=new k(null);return s.snap!=null?r=r.set(E(),!0):W(s.children,o=>{r=r.set(new S(o),!0)}),Xe(n,new Gt(s.path,r,t))}else return[]}function Tt(n,e,t){return Xe(n,new Re(ys(),e,t))}function Au(n,e,t){const s=k.fromObject(t);return Xe(n,new Ve(ys(),e,s))}function Du(n,e){return Xe(n,new yt(ys(),e))}function Pu(n,e,t){const s=Ts(n,t);if(s){const i=Rs(s),r=i.path,o=i.queryId,a=H(r,e),l=new yt(bs(o),a);return Ns(n,r,l)}else return[]}function Zt(n,e,t,s,i=!1){const r=e._path,o=n.syncPointTree_.get(r);let a=[];if(o&&(e._queryIdentifier==="default"||Kr(o,e))){const l=Su(o,e,t,s);Eu(o)&&(n.syncPointTree_=n.syncPointTree_.remove(r));const c=l.removed;if(a=l.events,!i){const d=c.findIndex(h=>h._queryParams.loadsAllData())!==-1,u=n.syncPointTree_.findOnPath(r,(h,p)=>me(p));if(d&&!u){const h=n.syncPointTree_.subtree(r);if(!h.isEmpty()){const p=xu(h);for(let _=0;_<p.length;++_){const w=p[_],P=w.query,z=Zr(n,w);n.listenProvider_.startListening(lt(P),bt(n,P),z.hashFn,z.onComplete)}}}!u&&c.length>0&&!s&&(d?n.listenProvider_.stopListening(lt(e),null):c.forEach(h=>{const p=n.queryToTagMap.get(hn(h));n.listenProvider_.stopListening(lt(h),p)}))}Lu(n,c)}return a}function Qr(n,e,t,s){const i=Ts(n,s);if(i!=null){const r=Rs(i),o=r.path,a=r.queryId,l=H(o,e),c=new Re(bs(a),l,t);return Ns(n,o,c)}else return[]}function Ou(n,e,t,s){const i=Ts(n,s);if(i){const r=Rs(i),o=r.path,a=r.queryId,l=H(o,e),c=k.fromObject(t),d=new Ve(bs(a),l,c);return Ns(n,o,d)}else return[]}function Zn(n,e,t,s=!1){const i=e._path;let r=null,o=!1;n.syncPointTree_.foreachOnPath(i,(h,p)=>{const _=H(h,i);r=r||fe(p,_),o=o||me(p)});let a=n.syncPointTree_.get(i);a?(o=o||me(a),r=r||fe(a,E())):(a=new qr,n.syncPointTree_=n.syncPointTree_.set(i,a));let l;r!=null?l=!0:(l=!1,r=m.EMPTY_NODE,n.syncPointTree_.subtree(i).foreachChild((p,_)=>{const w=fe(_,E());w&&(r=r.updateImmediateChild(p,w))}));const c=Kr(a,e);if(!c&&!e._queryParams.loadsAllData()){const h=hn(e);f(!n.queryToTagMap.has(h),"View does not exist, but we have a tag");const p=Fu();n.queryToTagMap.set(h,p),n.tagToQueryMap.set(p,h)}const d=ln(n.pendingWriteTree_,i);let u=Iu(a,e,t,d,r,l);if(!c&&!o&&!s){const h=Yr(a,e);u=u.concat($u(n,e,h))}return u}function un(n,e,t){const i=n.pendingWriteTree_,r=n.syncPointTree_.findOnPath(e,(o,a)=>{const l=H(o,e),c=fe(a,l);if(c)return c});return Br(i,e,r,t,!0)}function Mu(n,e){const t=e._path;let s=null;n.syncPointTree_.foreachOnPath(t,(c,d)=>{const u=H(c,t);s=s||fe(d,u)});let i=n.syncPointTree_.get(t);i?s=s||fe(i,E()):(i=new qr,n.syncPointTree_=n.syncPointTree_.set(t,i));const r=s!=null,o=r?new _e(s,!0,!1):null,a=ln(n.pendingWriteTree_,e._path),l=Gr(i,e,a,r?o.getNode():m.EMPTY_NODE,r);return gu(l)}function Xe(n,e){return Xr(e,n.syncPointTree_,null,ln(n.pendingWriteTree_,E()))}function Xr(n,e,t,s){if(b(n.path))return Jr(n,e,t,s);{const i=e.get(E());t==null&&i!=null&&(t=fe(i,E()));let r=[];const o=y(n.path),a=n.operationForChild(o),l=e.children.get(o);if(l&&a){const c=t?t.getImmediateChild(o):null,d=Wr(s,o);r=r.concat(Xr(a,l,c,d))}return i&&(r=r.concat(Is(i,n,s,t))),r}}function Jr(n,e,t,s){const i=e.get(E());t==null&&i!=null&&(t=fe(i,E()));let r=[];return e.children.inorderTraversal((o,a)=>{const l=t?t.getImmediateChild(o):null,c=Wr(s,o),d=n.operationForChild(o);d&&(r=r.concat(Jr(d,a,l,c)))}),i&&(r=r.concat(Is(i,n,s,t))),r}function Zr(n,e){const t=e.query,s=bt(n,t);return{hashFn:()=>(mu(e)||m.EMPTY_NODE).hash(),onComplete:i=>{if(i==="ok")return s?Pu(n,t._path,s):Du(n,t._path);{const r=Dl(i,t);return Zt(n,t,null,r)}}}}function bt(n,e){const t=hn(e);return n.queryToTagMap.get(t)}function hn(n){return n._path.toString()+"$"+n._queryIdentifier}function Ts(n,e){return n.tagToQueryMap.get(e)}function Rs(n){const e=n.indexOf("$");return f(e!==-1&&e<n.length-1,"Bad queryKey."),{queryId:n.substr(e+1),path:new S(n.substr(0,e))}}function Ns(n,e,t){const s=n.syncPointTree_.get(e);f(s,"Missing sync point for query tag that we're tracking");const i=ln(n.pendingWriteTree_,e);return Is(s,t,i,null)}function xu(n){return n.fold((e,t,s)=>{if(t&&me(t))return[cn(t)];{let i=[];return t&&(i=zr(t)),W(s,(r,o)=>{i=i.concat(o)}),i}})}function lt(n){return n._queryParams.loadsAllData()&&!n._queryParams.isDefault()?new(Ru())(n._repo,n._path):n}function Lu(n,e){for(let t=0;t<e.length;++t){const s=e[t];if(!s._queryParams.loadsAllData()){const i=hn(s),r=n.queryToTagMap.get(i);n.queryToTagMap.delete(i),n.tagToQueryMap.delete(r)}}}function Fu(){return Nu++}function $u(n,e,t){const s=e._path,i=bt(n,e),r=Zr(n,t),o=n.listenProvider_.startListening(lt(e),i,r.hashFn,r.onComplete),a=n.syncPointTree_.subtree(s);if(i)f(!me(a.value),"If we're adding a query, it shouldn't be shadowed");else{const l=a.fold((c,d,u)=>{if(!b(c)&&d&&me(d))return[cn(d).query];{let h=[];return d&&(h=h.concat(zr(d).map(p=>p.query))),W(u,(p,_)=>{h=h.concat(_)}),h}});for(let c=0;c<l.length;++c){const d=l[c];n.listenProvider_.stopListening(lt(d),bt(n,d))}}return o}/**
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
 */class ks{constructor(e){this.node_=e}getImmediateChild(e){const t=this.node_.getImmediateChild(e);return new ks(t)}node(){return this.node_}}class As{constructor(e,t){this.syncTree_=e,this.path_=t}getImmediateChild(e){const t=x(this.path_,e);return new As(this.syncTree_,t)}node(){return un(this.syncTree_,this.path_)}}const Bu=function(n){return n=n||{},n.timestamp=n.timestamp||new Date().getTime(),n},Pi=function(n,e,t){if(!n||typeof n!="object")return n;if(f(".sv"in n,"Unexpected leaf node or priority contents"),typeof n[".sv"]=="string")return Wu(n[".sv"],e,t);if(typeof n[".sv"]=="object")return Hu(n[".sv"],e);f(!1,"Unexpected server value: "+JSON.stringify(n,null,2))},Wu=function(n,e,t){switch(n){case"timestamp":return t.timestamp;default:f(!1,"Unexpected server value: "+n)}},Hu=function(n,e,t){n.hasOwnProperty("increment")||f(!1,"Unexpected server value: "+JSON.stringify(n,null,2));const s=n.increment;typeof s!="number"&&f(!1,"Unexpected increment value: "+s);const i=e.node();if(f(i!==null&&typeof i<"u","Expected ChildrenNode.EMPTY_NODE for nulls"),!i.isLeafNode())return s;const o=i.getValue();return typeof o!="number"?s:o+s},eo=function(n,e,t,s){return Ps(e,new As(t,n),s)},Ds=function(n,e,t){return Ps(n,new ks(e),t)};function Ps(n,e,t){const s=n.getPriority().val(),i=Pi(s,e.getImmediateChild(".priority"),t);let r;if(n.isLeafNode()){const o=n,a=Pi(o.getValue(),e,t);return a!==o.getValue()||i!==o.getPriority().val()?new F(a,M(i)):n}else{const o=n;return r=o,i!==o.getPriority().val()&&(r=r.updatePriority(new F(i))),o.forEachChild(D,(a,l)=>{const c=Ps(l,e.getImmediateChild(a),t);c!==l&&(r=r.updateImmediateChild(a,c))}),r}}/**
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
 */class Os{constructor(e="",t=null,s={children:{},childCount:0}){this.name=e,this.parent=t,this.node=s}}function dn(n,e){let t=e instanceof S?e:new S(e),s=n,i=y(t);for(;i!==null;){const r=Se(s.node.children,i)||{children:{},childCount:0};s=new Os(i,s,r),t=N(t),i=y(t)}return s}function Pe(n){return n.node.value}function Ms(n,e){n.node.value=e,es(n)}function to(n){return n.node.childCount>0}function Uu(n){return Pe(n)===void 0&&!to(n)}function fn(n,e){W(n.node.children,(t,s)=>{e(new Os(t,n,s))})}function no(n,e,t,s){t&&e(n),fn(n,i=>{no(i,e,!0)})}function ju(n,e,t){let s=n.parent;for(;s!==null;){if(e(s))return!0;s=s.parent}return!1}function Rt(n){return new S(n.parent===null?n.name:Rt(n.parent)+"/"+n.name)}function es(n){n.parent!==null&&Vu(n.parent,n.name,n)}function Vu(n,e,t){const s=Uu(t),i=Z(n.node.children,e);s&&i?(delete n.node.children[e],n.node.childCount--,es(n)):!s&&!i&&(n.node.children[e]=t.node,n.node.childCount++,es(n))}/**
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
 */const qu=/[\[\].#$\/\u0000-\u001F\u007F]/,Gu=/[\[\].#$\u0000-\u001F\u007F]/,Dn=10*1024*1024,xs=function(n){return typeof n=="string"&&n.length!==0&&!qu.test(n)},so=function(n){return typeof n=="string"&&n.length!==0&&!Gu.test(n)},zu=function(n){return n&&(n=n.replace(/^\/*\.info(\/|$)/,"/")),so(n)},Ls=function(n){return n===null||typeof n=="string"||typeof n=="number"&&!rn(n)||n&&typeof n=="object"&&Z(n,".sv")},ts=function(n,e,t,s){Nt(He(n,"value"),e,t)},Nt=function(n,e,t){const s=t instanceof S?new hc(t,n):t;if(e===void 0)throw new Error(n+"contains undefined "+Ee(s));if(typeof e=="function")throw new Error(n+"contains a function "+Ee(s)+" with contents = "+e.toString());if(rn(e))throw new Error(n+"contains "+e.toString()+" "+Ee(s));if(typeof e=="string"&&e.length>Dn/3&&sn(e)>Dn)throw new Error(n+"contains a string greater than "+Dn+" utf8 bytes "+Ee(s)+" ('"+e.substring(0,50)+"...')");if(e&&typeof e=="object"){let i=!1,r=!1;if(W(e,(o,a)=>{if(o===".value")i=!0;else if(o!==".priority"&&o!==".sv"&&(r=!0,!xs(o)))throw new Error(n+" contains an invalid key ("+o+") "+Ee(s)+`.  Keys must be non-empty strings and can't contain ".", "#", "$", "/", "[", or "]"`);dc(s,o),Nt(n,a,s),fc(s)}),i&&r)throw new Error(n+' contains ".value" child '+Ee(s)+" in addition to actual children.")}},Yu=function(n,e){let t,s;for(t=0;t<e.length;t++){s=e[t];const r=_t(s);for(let o=0;o<r.length;o++)if(!(r[o]===".priority"&&o===r.length-1)){if(!xs(r[o]))throw new Error(n+"contains an invalid key ("+r[o]+") in path "+s.toString()+`. Keys must be non-empty strings and can't contain ".", "#", "$", "/", "[", or "]"`)}}e.sort(uc);let i=null;for(t=0;t<e.length;t++){if(s=e[t],i!==null&&q(i,s))throw new Error(n+"contains a path "+i.toString()+" that is ancestor of another path "+s.toString());i=s}},io=function(n,e,t,s){const i=He(n,"values");if(!(e&&typeof e=="object")||Array.isArray(e))throw new Error(i+" must be an object containing the children to replace.");const r=[];W(e,(o,a)=>{const l=new S(o);if(Nt(i,a,x(t,l)),ds(l)===".priority"&&!Ls(a))throw new Error(i+"contains an invalid value for '"+l.toString()+"', which must be a valid Firebase priority (a string, finite number, server value, or null).");r.push(l)}),Yu(i,r)},Ku=function(n,e,t){if(rn(e))throw new Error(He(n,"priority")+"is "+e.toString()+", but must be a valid Firebase priority (a string, finite number, server value, or null).");if(!Ls(e))throw new Error(He(n,"priority")+"must be a valid Firebase priority (a string, finite number, server value, or null).")},ro=function(n,e,t,s){if(!so(t))throw new Error(He(n,e)+'was an invalid path = "'+t+`". Paths must be non-empty strings and can't contain ".", "#", "$", "[", or "]"`)},Qu=function(n,e,t,s){t&&(t=t.replace(/^\/*\.info(\/|$)/,"/")),ro(n,e,t)},xe=function(n,e){if(y(e)===".info")throw new Error(n+" failed = Can't modify data under /.info/")},Xu=function(n,e){const t=e.path.toString();if(typeof e.repoInfo.host!="string"||e.repoInfo.host.length===0||!xs(e.repoInfo.namespace)&&e.repoInfo.host.split(":")[0]!=="localhost"||t.length!==0&&!zu(t))throw new Error(He(n,"url")+`must be a valid firebase URL and the path can't contain ".", "#", "$", "[", or "]".`)};/**
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
 */class Ju{constructor(){this.eventLists_=[],this.recursionDepth_=0}}function pn(n,e){let t=null;for(let s=0;s<e.length;s++){const i=e[s],r=i.getPath();t!==null&&!fs(r,t.path)&&(n.eventLists_.push(t),t=null),t===null&&(t={events:[],path:r}),t.events.push(i)}t&&n.eventLists_.push(t)}function oo(n,e,t){pn(n,t),ao(n,s=>fs(s,e))}function V(n,e,t){pn(n,t),ao(n,s=>q(s,e)||q(e,s))}function ao(n,e){n.recursionDepth_++;let t=!0;for(let s=0;s<n.eventLists_.length;s++){const i=n.eventLists_[s];if(i){const r=i.path;e(r)?(Zu(n.eventLists_[s]),n.eventLists_[s]=null):t=!1}}t&&(n.eventLists_=[]),n.recursionDepth_--}function Zu(n){for(let e=0;e<n.events.length;e++){const t=n.events[e];if(t!==null){n.events[e]=null;const s=t.getEventRunner();it&&B("event: "+t.toString()),Ke(s)}}}/**
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
 */const eh="repo_interrupt",th=25;class nh{constructor(e,t,s,i){this.repoInfo_=e,this.forceRestClient_=t,this.authTokenProvider_=s,this.appCheckProvider_=i,this.dataUpdateCount=0,this.statsListener_=null,this.eventQueue_=new Ju,this.nextWriteId_=1,this.interceptServerDataCallback_=null,this.onDisconnect_=qt(),this.transactionQueueTree_=new Os,this.persistentConnection_=null,this.key=this.repoInfo_.toURLString()}toString(){return(this.repoInfo_.secure?"https://":"http://")+this.repoInfo_.host}}function sh(n,e,t){if(n.stats_=us(n.repoInfo_),n.forceRestClient_||xl())n.server_=new Vt(n.repoInfo_,(s,i,r,o)=>{Oi(n,s,i,r,o)},n.authTokenProvider_,n.appCheckProvider_),setTimeout(()=>Mi(n,!0),0);else{if(typeof t<"u"&&t!==null){if(typeof t!="object")throw new Error("Only objects are supported for option databaseAuthVariableOverride");try{L(t)}catch(s){throw new Error("Invalid authOverride provided: "+s)}}n.persistentConnection_=new ie(n.repoInfo_,e,(s,i,r,o)=>{Oi(n,s,i,r,o)},s=>{Mi(n,s)},s=>{rh(n,s)},n.authTokenProvider_,n.appCheckProvider_,t),n.server_=n.persistentConnection_}n.authTokenProvider_.addTokenChangeListener(s=>{n.server_.refreshAuthToken(s)}),n.appCheckProvider_.addTokenChangeListener(s=>{n.server_.refreshAppCheckToken(s.token)}),n.statsReporter_=Wl(n.repoInfo_,()=>new Bc(n.stats_,n.server_)),n.infoData_=new Mc,n.infoSyncTree_=new Di({startListening:(s,i,r,o)=>{let a=[];const l=n.infoData_.getNode(s._path);return l.isEmpty()||(a=Tt(n.infoSyncTree_,s._path,l),setTimeout(()=>{o("ok")},0)),a},stopListening:()=>{}}),Fs(n,"connected",!1),n.serverSyncTree_=new Di({startListening:(s,i,r,o)=>(n.server_.listen(s,r,i,(a,l)=>{const c=o(a,l);V(n.eventQueue_,s._path,c)}),[]),stopListening:(s,i)=>{n.server_.unlisten(s,i)}})}function ih(n){const t=n.infoData_.getNode(new S(".info/serverTimeOffset")).val()||0;return new Date().getTime()+t}function kt(n){return Bu({timestamp:ih(n)})}function Oi(n,e,t,s,i){n.dataUpdateCount++;const r=new S(e);t=n.interceptServerDataCallback_?n.interceptServerDataCallback_(e,t):t;let o=[];if(i)if(s){const l=Ft(t,c=>M(c));o=Ou(n.serverSyncTree_,r,l,i)}else{const l=M(t);o=Qr(n.serverSyncTree_,r,l,i)}else if(s){const l=Ft(t,c=>M(c));o=Au(n.serverSyncTree_,r,l)}else{const l=M(t);o=Tt(n.serverSyncTree_,r,l)}let a=r;o.length>0&&(a=Ge(n,r)),V(n.eventQueue_,a,o)}function Mi(n,e){Fs(n,"connected",e),e===!1&&ch(n)}function rh(n,e){W(e,(t,s)=>{Fs(n,t,s)})}function Fs(n,e,t){const s=new S("/.info/"+e),i=M(t);n.infoData_.updateSnapshot(s,i);const r=Tt(n.infoSyncTree_,s,i);V(n.eventQueue_,s,r)}function _n(n){return n.nextWriteId_++}function oh(n,e,t){const s=Mu(n.serverSyncTree_,e);return s!=null?Promise.resolve(s):n.server_.get(e).then(i=>{const r=M(i).withIndex(e._queryParams.getIndex());Zn(n.serverSyncTree_,e,t,!0);let o;if(e._queryParams.loadsAllData())o=Tt(n.serverSyncTree_,e._path,r);else{const a=bt(n.serverSyncTree_,e);o=Qr(n.serverSyncTree_,e._path,r,a)}return V(n.eventQueue_,e._path,o),Zt(n.serverSyncTree_,e,t,null,!0),r},i=>(Je(n,"get for query "+L(e)+" failed: "+i),Promise.reject(new Error(i))))}function ah(n,e,t,s,i){Je(n,"set",{path:e.toString(),value:t,priority:s});const r=kt(n),o=M(t,s),a=un(n.serverSyncTree_,e),l=Ds(o,a,r),c=_n(n),d=Ss(n.serverSyncTree_,e,l,c,!0);pn(n.eventQueue_,d),n.server_.put(e.toString(),o.val(!0),(h,p)=>{const _=h==="ok";_||U("set at "+e+" failed: "+h);const w=ce(n.serverSyncTree_,c,!_);V(n.eventQueue_,e,w),ge(n,i,h,p)});const u=Bs(n,e);Ge(n,u),V(n.eventQueue_,u,[])}function lh(n,e,t,s){Je(n,"update",{path:e.toString(),value:t});let i=!0;const r=kt(n),o={};if(W(t,(a,l)=>{i=!1,o[a]=eo(x(e,a),M(l),n.serverSyncTree_,r)}),i)B("update() called with empty data.  Don't do anything."),ge(n,s,"ok",void 0);else{const a=_n(n),l=ku(n.serverSyncTree_,e,o,a);pn(n.eventQueue_,l),n.server_.merge(e.toString(),t,(c,d)=>{const u=c==="ok";u||U("update at "+e+" failed: "+c);const h=ce(n.serverSyncTree_,a,!u),p=h.length>0?Ge(n,e):e;V(n.eventQueue_,p,h),ge(n,s,c,d)}),W(t,c=>{const d=Bs(n,x(e,c));Ge(n,d)}),V(n.eventQueue_,e,[])}}function ch(n){Je(n,"onDisconnectEvents");const e=kt(n),t=qt();zn(n.onDisconnect_,E(),(i,r)=>{const o=eo(i,r,n.serverSyncTree_,e);Qe(t,i,o)});let s=[];zn(t,E(),(i,r)=>{s=s.concat(Tt(n.serverSyncTree_,i,r));const o=Bs(n,i);Ge(n,o)}),n.onDisconnect_=qt(),V(n.eventQueue_,E(),s)}function uh(n,e,t){n.server_.onDisconnectCancel(e.toString(),(s,i)=>{s==="ok"&&Gn(n.onDisconnect_,e),ge(n,t,s,i)})}function xi(n,e,t,s){const i=M(t);n.server_.onDisconnectPut(e.toString(),i.val(!0),(r,o)=>{r==="ok"&&Qe(n.onDisconnect_,e,i),ge(n,s,r,o)})}function hh(n,e,t,s,i){const r=M(t,s);n.server_.onDisconnectPut(e.toString(),r.val(!0),(o,a)=>{o==="ok"&&Qe(n.onDisconnect_,e,r),ge(n,i,o,a)})}function dh(n,e,t,s){if(Fn(t)){B("onDisconnect().update() called with empty data.  Don't do anything."),ge(n,s,"ok",void 0);return}n.server_.onDisconnectMerge(e.toString(),t,(i,r)=>{i==="ok"&&W(t,(o,a)=>{const l=M(a);Qe(n.onDisconnect_,x(e,o),l)}),ge(n,s,i,r)})}function fh(n,e,t){let s;y(e._path)===".info"?s=Zn(n.infoSyncTree_,e,t):s=Zn(n.serverSyncTree_,e,t),oo(n.eventQueue_,e._path,s)}function ph(n,e,t){let s;y(e._path)===".info"?s=Zt(n.infoSyncTree_,e,t):s=Zt(n.serverSyncTree_,e,t),oo(n.eventQueue_,e._path,s)}function _h(n){n.persistentConnection_&&n.persistentConnection_.interrupt(eh)}function Je(n,...e){let t="";n.persistentConnection_&&(t=n.persistentConnection_.id+":"),B(t,...e)}function ge(n,e,t,s){e&&Ke(()=>{if(t==="ok")e(null);else{const i=(t||"error").toUpperCase();let r=i;s&&(r+=": "+s);const o=new Error(r);o.code=i,e(o)}})}function mh(n,e,t,s,i,r){Je(n,"transaction on "+e);const o={path:e,update:t,onComplete:s,status:null,order:or(),applyLocally:r,retryCount:0,unwatcher:i,abortReason:null,currentWriteId:null,currentInputSnapshot:null,currentOutputSnapshotRaw:null,currentOutputSnapshotResolved:null},a=$s(n,e,void 0);o.currentInputSnapshot=a;const l=o.update(a.val());if(l===void 0)o.unwatcher(),o.currentOutputSnapshotRaw=null,o.currentOutputSnapshotResolved=null,o.onComplete&&o.onComplete(null,!1,o.currentInputSnapshot);else{Nt("transaction failed: Data returned ",l,o.path),o.status=0;const c=dn(n.transactionQueueTree_,e),d=Pe(c)||[];d.push(o),Ms(c,d);let u;typeof l=="object"&&l!==null&&Z(l,".priority")?(u=Se(l,".priority"),f(Ls(u),"Invalid priority returned by transaction. Priority must be a valid string, finite number, server value, or null.")):u=(un(n.serverSyncTree_,e)||m.EMPTY_NODE).getPriority().val();const h=kt(n),p=M(l,u),_=Ds(p,a,h);o.currentOutputSnapshotRaw=p,o.currentOutputSnapshotResolved=_,o.currentWriteId=_n(n);const w=Ss(n.serverSyncTree_,e,_,o.currentWriteId,o.applyLocally);V(n.eventQueue_,e,w),mn(n,n.transactionQueueTree_)}}function $s(n,e,t){return un(n.serverSyncTree_,e,t)||m.EMPTY_NODE}function mn(n,e=n.transactionQueueTree_){if(e||gn(n,e),Pe(e)){const t=co(n,e);f(t.length>0,"Sending zero length transaction queue"),t.every(i=>i.status===0)&&gh(n,Rt(e),t)}else to(e)&&fn(e,t=>{mn(n,t)})}function gh(n,e,t){const s=t.map(c=>c.currentWriteId),i=$s(n,e,s);let r=i;const o=i.hash();for(let c=0;c<t.length;c++){const d=t[c];f(d.status===0,"tryToSendTransactionQueue_: items in queue should all be run."),d.status=1,d.retryCount++;const u=H(e,d.path);r=r.updateChild(u,d.currentOutputSnapshotRaw)}const a=r.val(!0),l=e;n.server_.put(l.toString(),a,c=>{Je(n,"transaction put response",{path:l.toString(),status:c});let d=[];if(c==="ok"){const u=[];for(let h=0;h<t.length;h++)t[h].status=2,d=d.concat(ce(n.serverSyncTree_,t[h].currentWriteId)),t[h].onComplete&&u.push(()=>t[h].onComplete(null,!0,t[h].currentOutputSnapshotResolved)),t[h].unwatcher();gn(n,dn(n.transactionQueueTree_,e)),mn(n,n.transactionQueueTree_),V(n.eventQueue_,e,d);for(let h=0;h<u.length;h++)Ke(u[h])}else{if(c==="datastale")for(let u=0;u<t.length;u++)t[u].status===3?t[u].status=4:t[u].status=0;else{U("transaction at "+l.toString()+" failed: "+c);for(let u=0;u<t.length;u++)t[u].status=4,t[u].abortReason=c}Ge(n,e)}},o)}function Ge(n,e){const t=lo(n,e),s=Rt(t),i=co(n,t);return vh(n,i,s),s}function vh(n,e,t){if(e.length===0)return;const s=[];let i=[];const o=e.filter(a=>a.status===0).map(a=>a.currentWriteId);for(let a=0;a<e.length;a++){const l=e[a],c=H(t,l.path);let d=!1,u;if(f(c!==null,"rerunTransactionsUnderNode_: relativePath should not be null."),l.status===4)d=!0,u=l.abortReason,i=i.concat(ce(n.serverSyncTree_,l.currentWriteId,!0));else if(l.status===0)if(l.retryCount>=th)d=!0,u="maxretry",i=i.concat(ce(n.serverSyncTree_,l.currentWriteId,!0));else{const h=$s(n,l.path,o);l.currentInputSnapshot=h;const p=e[a].update(h.val());if(p!==void 0){Nt("transaction failed: Data returned ",p,l.path);let _=M(p);typeof p=="object"&&p!=null&&Z(p,".priority")||(_=_.updatePriority(h.getPriority()));const P=l.currentWriteId,z=kt(n),te=Ds(_,h,z);l.currentOutputSnapshotRaw=_,l.currentOutputSnapshotResolved=te,l.currentWriteId=_n(n),o.splice(o.indexOf(P),1),i=i.concat(Ss(n.serverSyncTree_,l.path,te,l.currentWriteId,l.applyLocally)),i=i.concat(ce(n.serverSyncTree_,P,!0))}else d=!0,u="nodata",i=i.concat(ce(n.serverSyncTree_,l.currentWriteId,!0))}V(n.eventQueue_,t,i),i=[],d&&(e[a].status=2,(function(h){setTimeout(h,Math.floor(0))})(e[a].unwatcher),e[a].onComplete&&(u==="nodata"?s.push(()=>e[a].onComplete(null,!1,e[a].currentInputSnapshot)):s.push(()=>e[a].onComplete(new Error(u),!1,null))))}gn(n,n.transactionQueueTree_);for(let a=0;a<s.length;a++)Ke(s[a]);mn(n,n.transactionQueueTree_)}function lo(n,e){let t,s=n.transactionQueueTree_;for(t=y(e);t!==null&&Pe(s)===void 0;)s=dn(s,t),e=N(e),t=y(e);return s}function co(n,e){const t=[];return uo(n,e,t),t.sort((s,i)=>s.order-i.order),t}function uo(n,e,t){const s=Pe(e);if(s)for(let i=0;i<s.length;i++)t.push(s[i]);fn(e,i=>{uo(n,i,t)})}function gn(n,e){const t=Pe(e);if(t){let s=0;for(let i=0;i<t.length;i++)t[i].status!==2&&(t[s]=t[i],s++);t.length=s,Ms(e,t.length>0?t:void 0)}fn(e,s=>{gn(n,s)})}function Bs(n,e){const t=Rt(lo(n,e)),s=dn(n.transactionQueueTree_,e);return ju(s,i=>{Pn(n,i)}),Pn(n,s),no(s,i=>{Pn(n,i)}),t}function Pn(n,e){const t=Pe(e);if(t){const s=[];let i=[],r=-1;for(let o=0;o<t.length;o++)t[o].status===3||(t[o].status===1?(f(r===o-1,"All SENT items should be at beginning of queue."),r=o,t[o].status=3,t[o].abortReason="set"):(f(t[o].status===0,"Unexpected transaction status in abort"),t[o].unwatcher(),i=i.concat(ce(n.serverSyncTree_,t[o].currentWriteId,!0)),t[o].onComplete&&s.push(t[o].onComplete.bind(null,new Error("set"),!1,null))));r===-1?Ms(e,void 0):t.length=r+1,V(n.eventQueue_,Rt(e),i);for(let o=0;o<s.length;o++)Ke(s[o])}}/**
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
 */function yh(n){let e="";const t=n.split("/");for(let s=0;s<t.length;s++)if(t[s].length>0){let i=t[s];try{i=decodeURIComponent(i.replace(/\+/g," "))}catch{}e+="/"+i}return e}function bh(n){const e={};n.charAt(0)==="?"&&(n=n.substring(1));for(const t of n.split("&")){if(t.length===0)continue;const s=t.split("=");s.length===2?e[decodeURIComponent(s[0])]=decodeURIComponent(s[1]):U(`Invalid query segment '${t}' in query '${n}'`)}return e}const Li=function(n,e){const t=Ch(n),s=t.namespace;t.domain==="firebase.com"&&oe(t.host+" is no longer supported. Please use <YOUR FIREBASE>.firebaseio.com instead"),(!s||s==="undefined")&&t.domain!=="localhost"&&oe("Cannot parse Firebase url. Please use https://<YOUR FIREBASE>.firebaseio.com"),t.secure||Tl();const i=t.scheme==="ws"||t.scheme==="wss";return{repoInfo:new yr(t.host,t.secure,s,i,e,"",s!==t.subdomain),path:new S(t.pathString)}},Ch=function(n){let e="",t="",s="",i="",r="",o=!0,a="https",l=443;if(typeof n=="string"){let c=n.indexOf("//");c>=0&&(a=n.substring(0,c-1),n=n.substring(c+2));let d=n.indexOf("/");d===-1&&(d=n.length);let u=n.indexOf("?");u===-1&&(u=n.length),e=n.substring(0,Math.min(d,u)),d<u&&(i=yh(n.substring(d,u)));const h=bh(n.substring(Math.min(n.length,u)));c=e.indexOf(":"),c>=0?(o=a==="https"||a==="wss",l=parseInt(e.substring(c+1),10)):c=e.length;const p=e.slice(0,c);if(p.toLowerCase()==="localhost")t="localhost";else if(p.split(".").length<=2)t=p;else{const _=e.indexOf(".");s=e.substring(0,_).toLowerCase(),t=e.substring(_+1),r=s}"ns"in h&&(r=h.ns)}return{host:e,port:l,domain:t,subdomain:s,secure:o,scheme:a,pathString:i,namespace:r}};/**
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
 */class wh{constructor(e,t,s,i){this.eventType=e,this.eventRegistration=t,this.snapshot=s,this.prevName=i}getPath(){const e=this.snapshot.ref;return this.eventType==="value"?e._path:e.parent._path}getEventType(){return this.eventType}getEventRunner(){return this.eventRegistration.getEventRunner(this)}toString(){return this.getPath().toString()+":"+this.eventType+":"+L(this.snapshot.exportVal())}}class Eh{constructor(e,t,s){this.eventRegistration=e,this.error=t,this.path=s}getPath(){return this.path}getEventType(){return"cancel"}getEventRunner(){return this.eventRegistration.getEventRunner(this)}toString(){return this.path.toString()+":cancel"}}/**
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
 */class ho{constructor(e,t){this.snapshotCallback=e,this.cancelCallback=t}onValue(e,t){this.snapshotCallback.call(null,e,t)}onCancel(e){return f(this.hasCancelCallback,"Raising a cancel event on a listener with no cancel callback"),this.cancelCallback.call(null,e)}get hasCancelCallback(){return!!this.cancelCallback}matches(e){return this.snapshotCallback===e.snapshotCallback||this.snapshotCallback.userCallback!==void 0&&this.snapshotCallback.userCallback===e.snapshotCallback.userCallback&&this.snapshotCallback.context===e.snapshotCallback.context}}/**
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
 */class Ih{constructor(e,t){this._repo=e,this._path=t}cancel(){const e=new K;return uh(this._repo,this._path,e.wrapCallback(()=>{})),e.promise}remove(){xe("OnDisconnect.remove",this._path);const e=new K;return xi(this._repo,this._path,null,e.wrapCallback(()=>{})),e.promise}set(e){xe("OnDisconnect.set",this._path),ts("OnDisconnect.set",e,this._path);const t=new K;return xi(this._repo,this._path,e,t.wrapCallback(()=>{})),t.promise}setWithPriority(e,t){xe("OnDisconnect.setWithPriority",this._path),ts("OnDisconnect.setWithPriority",e,this._path),Ku("OnDisconnect.setWithPriority",t);const s=new K;return hh(this._repo,this._path,e,t,s.wrapCallback(()=>{})),s.promise}update(e){xe("OnDisconnect.update",this._path),io("OnDisconnect.update",e,this._path);const t=new K;return dh(this._repo,this._path,e,t.wrapCallback(()=>{})),t.promise}}/**
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
 */class Ws{constructor(e,t,s,i){this._repo=e,this._path=t,this._queryParams=s,this._orderByCalled=i}get key(){return b(this._path)?null:ds(this._path)}get ref(){return new ee(this._repo,this._path)}get _queryIdentifier(){const e=Ci(this._queryParams),t=ls(e);return t==="{}"?"default":t}get _queryObject(){return Ci(this._queryParams)}isEqual(e){if(e=ve(e),!(e instanceof Ws))return!1;const t=this._repo===e._repo,s=fs(this._path,e._path),i=this._queryIdentifier===e._queryIdentifier;return t&&s&&i}toJSON(){return this.toString()}toString(){return this._repo.toString()+cc(this._path)}}class ee extends Ws{constructor(e,t){super(e,t,new gs,!1)}get parent(){const e=Nr(this._path);return e===null?null:new ee(this._repo,e)}get root(){let e=this;for(;e.parent!==null;)e=e.parent;return e}}class ze{constructor(e,t,s){this._node=e,this.ref=t,this._index=s}get priority(){return this._node.getPriority().val()}get key(){return this.ref.key}get size(){return this._node.numChildren()}child(e){const t=new S(e),s=ns(this.ref,e);return new ze(this._node.getChild(t),s,D)}exists(){return!this._node.isEmpty()}exportVal(){return this._node.val(!0)}forEach(e){return this._node.isLeafNode()?!1:!!this._node.forEachChild(this._index,(s,i)=>e(new ze(i,ns(this.ref,s),D)))}hasChild(e){const t=new S(e);return!this._node.getChild(t).isEmpty()}hasChildren(){return this._node.isLeafNode()?!1:!this._node.isEmpty()}toJSON(){return this.exportVal()}val(){return this._node.val()}}function T(n,e){return n=ve(n),n._checkNotDeleted("ref"),e!==void 0?ns(n._root,e):n._root}function ns(n,e){return n=ve(n),y(n._path)===null?Qu("child","path",e):ro("child","path",e),new ee(n._repo,x(n._path,e))}function fo(n){return n=ve(n),new Ih(n._repo,n._path)}function Fi(n,e){n=ve(n),xe("set",n._path),ts("set",e,n._path);const t=new K;return ah(n._repo,n._path,e,null,t.wrapCallback(()=>{})),t.promise}function ye(n,e){io("update",e,n._path);const t=new K;return lh(n._repo,n._path,e,t.wrapCallback(()=>{})),t.promise}function ke(n){n=ve(n);const e=new ho(()=>{}),t=new vn(e);return oh(n._repo,n,t).then(s=>new ze(s,new ee(n._repo,n._path),n._queryParams.getIndex()))}class vn{constructor(e){this.callbackContext=e}respondsTo(e){return e==="value"}createEvent(e,t){const s=t._queryParams.getIndex();return new wh("value",this,new ze(e.snapshotNode,new ee(t._repo,t._path),s))}getEventRunner(e){return e.getEventType()==="cancel"?()=>this.callbackContext.onCancel(e.error):()=>this.callbackContext.onValue(e.snapshot,null)}createCancelEvent(e,t){return this.callbackContext.hasCancelCallback?new Eh(this,e,t):null}matches(e){return e instanceof vn?!e.callbackContext||!this.callbackContext?!0:e.callbackContext.matches(this.callbackContext):!1}hasAnyCallback(){return this.callbackContext!==null}}function Sh(n,e,t,s,i){const r=new ho(t,void 0),o=new vn(r);return fh(n._repo,n,o),()=>ph(n._repo,n,o)}function yn(n,e,t,s){return Sh(n,"value",e)}Cu(ee);Tu(ee);/**
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
 */const Th="FIREBASE_DATABASE_EMULATOR_HOST",ss={};let Rh=!1;function Nh(n,e,t,s){const i=e.lastIndexOf(":"),r=e.substring(0,i),o=os(r);n.repoInfo_=new yr(e,o,n.repoInfo_.namespace,n.repoInfo_.webSocketOnly,n.repoInfo_.nodeAdmin,n.repoInfo_.persistenceKey,n.repoInfo_.includeNamespaceInQueryParams,!0,t),s&&(n.authTokenProvider_=s)}function kh(n,e,t,s,i){let r=s||n.options.databaseURL;r===void 0&&(n.options.projectId||oe("Can't determine Firebase Database URL. Be sure to include  a Project ID when calling firebase.initializeApp()."),B("Using default host for project ",n.options.projectId),r=`${n.options.projectId}-default-rtdb.firebaseio.com`);let o=Li(r,i),a=o.repoInfo,l;typeof process<"u"&&si&&(l=si[Th]),l?(r=`http://${l}?ns=${a.namespace}`,o=Li(r,i),a=o.repoInfo):o.repoInfo.secure;const c=new Fl(n.name,n.options,e);Xu("Invalid Firebase Database URL",o),b(o.path)||oe("Database URL must point to the root of a Firebase Database (not including a child path).");const d=Dh(a,n,c,new Ll(n,t));return new Ph(d,n)}function Ah(n,e){const t=ss[e];(!t||t[n.key]!==n)&&oe(`Database ${e}(${n.repoInfo_}) has already been deleted.`),_h(n),delete t[n.key]}function Dh(n,e,t,s){let i=ss[e.name];i||(i={},ss[e.name]=i);let r=i[n.toURLString()];return r&&oe("Database initialized multiple times. Please make sure the format of the database URL matches with each database() call."),r=new nh(n,Rh,t,s),i[n.toURLString()]=r,r}class Ph{constructor(e,t){this._repoInternal=e,this.app=t,this.type="database",this._instanceStarted=!1}get _repo(){return this._instanceStarted||(sh(this._repoInternal,this.app.options.appId,this.app.options.databaseAuthVariableOverride),this._instanceStarted=!0),this._repoInternal}get _root(){return this._rootInternal||(this._rootInternal=new ee(this._repo,E())),this._rootInternal}_delete(){return this._rootInternal!==null&&(Ah(this._repo,this.app.name),this._repoInternal=null,this._rootInternal=null),Promise.resolve()}_checkNotDeleted(e){this._rootInternal===null&&oe("Cannot call "+e+" on a deleted database.")}}function Oh(n=ul(),e){const t=rl(n,"database").getImmediate({identifier:e});if(!t._instanceStarted){const s=Vo("database");s&&Mh(t,...s)}return t}function Mh(n,e,t,s={}){n=ve(n),n._checkNotDeleted("useEmulator");const i=`${e}:${t}`,r=n._repoInternal;if(n._instanceStarted){if(i===n._repoInternal.repoInfo_.host&&$t(s,r.repoInfo_.emulatorOptions))return;oe("connectDatabaseEmulator() cannot initialize or alter the emulator configuration after the database instance has started.")}let o;if(r.repoInfo_.nodeAdmin)s.mockUserToken&&oe('mockUserToken is not supported by the Admin SDK. For client access with mock users, please use the "firebase" package instead of "firebase-admin".'),o=new Mt(Mt.OWNER);else if(s.mockUserToken){const a=typeof s.mockUserToken=="string"?s.mockUserToken:Go(s.mockUserToken,n.app.options.projectId);o=new Mt(a)}os(e)&&(qo(e),Ko("Database",!0)),Nh(r,i,s,o)}/**
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
 */function xh(n){Cl(cl),Wt(new dt("database",(e,{instanceIdentifier:t})=>{const s=e.getProvider("app").getImmediate(),i=e.getProvider("auth-internal"),r=e.getProvider("app-check-internal");return kh(s,i,r,t)},"PUBLIC").setMultipleInstances(!0)),Fe(ii,ri,n),Fe(ii,ri,"esm2017")}/**
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
 */class Lh{constructor(e,t){this.committed=e,this.snapshot=t}toJSON(){return{committed:this.committed,snapshot:this.snapshot.toJSON()}}}function ae(n,e,t){var s;if(n=ve(n),xe("Reference.transaction",n._path),n.key===".length"||n.key===".keys")throw"Reference.transaction failed: "+n.key+" is a read-only object.";const i=(s=void 0)!==null&&s!==void 0?s:!0,r=new K,o=(l,c,d)=>{let u=null;l?r.reject(l):(u=new ze(d,new ee(n._repo,n._path),D),r.resolve(new Lh(c,u)))},a=yn(n,()=>{});return mh(n._repo,n._path,e,o,a,i),r.promise}ie.prototype.simpleListen=function(n,e){this.sendRequest("q",{p:n},e)};ie.prototype.echo=function(n,e){this.sendRequest("echo",{d:n},e)};xh();var Fh="firebase",$h="11.10.0";/**
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
 */Fe(Fh,$h,"app");const Bh={apiKey:"AIzaSyBUWOun6Fc6R58T_FAxDB217kypYi_Y59c",authDomain:"mori-no-yakai.firebaseapp.com",databaseURL:"https://mori-no-yakai-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"mori-no-yakai",storageBucket:"mori-no-yakai.firebasestorage.app",messagingSenderId:"126231981141",appId:"1:126231981141:web:b593b219aeec9f8a7078dc",measurementId:"G-TK8226P7P9"},Wh=tr(Bh),R=Oh(Wh),Hh="1night",po="mori-no-yakai-host-unlocked";function Uh(n){return n.trim()===Hh}function _o(){return localStorage.getItem(po)==="1"}function jh(){localStorage.setItem(po,"1")}const v={villager:{id:"villager",name:"うさぎ",emoji:"🐰",team:"forest",description:"夜は何もせず眠っています。"},werewolf:{id:"werewolf",name:"おおかみ",emoji:"🐺",team:"wolf",description:"夜、仲間のおおかみと顔を見合わせます。1匹だけなら中央カードを1枚見られます。"},seer:{id:"seer",name:"ふくろう",emoji:"🦉",team:"forest",description:"夜、他の1人のカード、または中央カード2枚のどちらかを見られます。"},robber:{id:"robber",name:"きつね",emoji:"🦊",team:"forest",description:"夜、他の1人と自分のカードを交換し、新しい役職を確認します。"},minion:{id:"minion",name:"子狼",emoji:"🐾",team:"wolf",description:"夜、おおかみが誰かを確認します（自分の正体はおおかみ側には明かされません）。"}},Vh=["werewolf","minion","seer","robber"];function mo(n){return{centerCount:3,werewolfCount:n<=5?1:2,seer:!0,robber:!0,minion:!0}}function Hs(n,e){const t=e.werewolfCount+(e.seer?1:0)+(e.robber?1:0)+(e.minion?1:0);return n+e.centerCount-t}function $i(n,e){return e.werewolfCount<0?!1:Hs(n,e)>=0}function qh(n,e){const t=Hs(n,e);if(t<0)throw new Error("役職構成が不正です（うさぎの数がマイナスになります）");const s=[];for(let i=0;i<e.werewolfCount;i++)s.push("werewolf");e.seer&&s.push("seer"),e.robber&&s.push("robber"),e.minion&&s.push("minion");for(let i=0;i<t;i++)s.push("villager");return s}function Gh(n){const e=new Set;return n.werewolfCount>0&&e.add("werewolf"),n.minion&&e.add("minion"),n.seer&&e.add("seer"),n.robber&&e.add("robber"),Vh.filter(t=>e.has(t))}function zh(n,e=Math.random){const t=n.slice();for(let s=t.length-1;s>0;s--){const i=Math.floor(e()*(s+1));[t[s],t[i]]=[t[i],t[s]]}return t}const Yh=[15e3,3e4,45e3,6e4],At=3e4,go=1e4,Kh=6e4,Qh=[3*6e4,5*6e4,8*6e4],Xh=5*6e4;function Jh(n){const e={};for(const i of n)e[i.id]=0;for(const i of n)i.vote&&i.vote in e&&(e[i.vote]+=1);const t=Math.max(0,...Object.values(e)),s=t>=2?Object.entries(e).filter(([,i])=>i===t).map(([i])=>i):[];return{counts:e,eliminatedIds:s}}function Zh(n,e){const t=new Set(e);return n.some(r=>t.has(r.id)&&r.currentRole==="werewolf")||!n.some(r=>r.currentRole==="werewolf")&&(e.length===0||n.some(o=>t.has(o.id)&&o.currentRole==="minion"))?"forest":"wolf"}function ed(n,e){return n.length===0?!1:n.every(t=>(t.nightReadyStep??-1)>=e)}function Bi(n,e){const t=n.nightStepDurationMs??At,s=n.nightStepEndsAt-t;return e-s>=go}function vo(n,e){const t=n.nightStepDurationMs??At,s=n.nightStepIndex+1;return s>=n.nightOrder.length?{...n,phase:"discuss",discussEndsAt:e+n.discussDurationMs}:{...n,nightStepIndex:s,nightStepEndsAt:e+t}}function yo(n,e){return{...n,phase:"vote",voteEndsAt:e+Kh}}function td(n,e){return n.length===0?!1:n.every(t=>t.discussReadyRound===e)}function bo(n){return{...n,phase:"result"}}function nd(n){return Object.keys(n).filter(e=>!n[e].left)}const Wi="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";function sd(){let n="";for(let e=0;e<5;e++)n+=Wi[Math.floor(Math.random()*Wi.length)];return n}function id(){return crypto.randomUUID()}async function Co(n,e,t){const s=T(R,`rooms/${n}/members/${e}`),i=T(R,`rooms/${n}/state`);if(!(await ke(i)).exists()){if(!_o())throw new Error("この部屋は存在しません");const a={phase:"lobby",hostId:e,createdAt:Date.now(),roleConfig:mo(1),nightOrder:[],nightStepIndex:0,nightStepDurationMs:At,nightStepEndsAt:0,discussDurationMs:Xh,discussEndsAt:0,voteEndsAt:0,roundNumber:0};await Fi(i,a)}if((await ke(s)).exists())await ye(s,{name:t,online:!0,left:!1});else{const a={id:e,name:t,online:!0,joinedAt:Date.now()};await Fi(s,a)}fo(T(R,`rooms/${n}/members/${e}/online`)).set(!1)}async function rd(n,e){await ye(T(R,`rooms/${n}/members/${e}`),{online:!0}),fo(T(R,`rooms/${n}/members/${e}/online`)).set(!1)}async function od(n,e){await ye(T(R,`rooms/${n}/members/${e}`),{online:!1,left:!0})}function ad(n,e){return yn(T(R,`rooms/${n}/state`),t=>e(t.val()))}function ld(n,e){return yn(T(R,`rooms/${n}/members`),t=>e(t.val()??{}))}function cd(n,e){return yn(T(R,`rooms/${n}/centerCards`),t=>{const s=t.val();if(Array.isArray(s)){e({round:-1,cards:s});return}e(s)})}async function ud(n,e){await ye(T(R,`rooms/${n}/state`),{roleConfig:e})}async function hd(n,e){await ye(T(R,`rooms/${n}/state`),{discussDurationMs:e})}function dd(n){return mo(n)}async function fd(n){await ae(T(R,`rooms/${n}`),e=>{if(!e||!e.state||e.state.phase!=="lobby")return e;const t=e.members??{},s=nd(t);if(s.length<3)return e;const i=qh(s.length,e.state.roleConfig),r=zh(i),o=r.slice(0,s.length),a=r.slice(s.length);for(const u of Object.keys(t))delete t[u].originalRole,delete t[u].currentRole,delete t[u].knownRole,delete t[u].vote,delete t[u].nightReadyStep,delete t[u].discussReadyRound,delete t[u].seerReveal;s.forEach((u,h)=>{t[u].originalRole=o[h],t[u].currentRole=o[h],t[u].knownRole=o[h]});const l=Gh(e.state.roleConfig),c=e.state.nightStepDurationMs??At,d=(e.state.roundNumber??0)+1;return e.members=t,e.centerCards={round:d,cards:a},e.state={...e.state,phase:l.length>0?"night":"discuss",nightOrder:l,nightStepIndex:0,nightStepDurationMs:c,nightStepEndsAt:Date.now()+c,discussEndsAt:Date.now()+e.state.discussDurationMs,roundNumber:d},e})}async function pd(n,e){await ye(T(R,`rooms/${n}/state`),{nightStepDurationMs:e})}async function _d(n,e,t){const s=T(R,`rooms/${n}/members/${e}/currentRole`),i=T(R,`rooms/${n}/members/${t}/currentRole`),[r,o]=await Promise.all([ke(s),ke(i)]),a=r.val(),l=o.val();return await ye(T(R,`rooms/${n}/members`),{[`${e}/currentRole`]:l,[`${t}/currentRole`]:a,[`${e}/knownRole`]:l}),l}async function On(n,e,t){await ye(T(R,`rooms/${n}/members/${e}`),{seerReveal:t})}async function md(n,e,t){await ae(T(R,`rooms/${n}`),s=>{var i;return!s||!s.state||s.state.phase!=="vote"||!((i=s.members)!=null&&i[e])||(s.members[e].vote=t),s})}async function wo(n){await ae(T(R,`rooms/${n}`),e=>{if(!e||!e.state)return e;const t=e.state,s=Date.now();return t.phase==="night"&&s>=t.nightStepEndsAt?e.state=vo(t,s):t.phase==="discuss"&&s>=t.discussEndsAt?e.state=yo(t,s):t.phase==="vote"&&s>=t.voteEndsAt&&(e.state=bo(t)),e})}async function gd(n,e,t){await ae(T(R,`rooms/${n}`),s=>{var i;return!(s!=null&&s.state)||s.state.phase!=="night"||s.state.nightStepIndex!==t||!((i=s.members)!=null&&i[e])||(s.members[e].nightReadyStep=t),s}),await Ct(n)}let Ce=null;function vd(n,e){const t=`${n}:${e.nightStepIndex}`;if((Ce==null?void 0:Ce.key)===t)return;Ce&&clearTimeout(Ce.timer);const s=e.nightStepDurationMs??At,i=e.nightStepEndsAt-s,r=Math.max(0,go-(Date.now()-i)),o=setTimeout(()=>{Ce=null,Ct(n)},r+50);Ce={key:t,timer:o}}async function Ct(n){const t=(await ke(T(R,`rooms/${n}`))).val();if(!(t!=null&&t.state)||t.state.phase!=="night")return;const s=t.members??{},i=Object.values(s).filter(r=>r.originalRole);if(ed(i,t.state.nightStepIndex)){if(!Bi(t.state,Date.now())){vd(n,t.state);return}await ae(T(R,`rooms/${n}`),r=>(!(r!=null&&r.state)||r.state.phase!=="night"||r.state.nightStepIndex!==t.state.nightStepIndex||!Bi(r.state,Date.now())||(r.state=vo(r.state,Date.now())),r))}}async function yd(n,e,t){await ae(T(R,`rooms/${n}`),s=>{var i;return!(s!=null&&s.state)||s.state.phase!=="discuss"||s.state.roundNumber!==t||!((i=s.members)!=null&&i[e])||(s.members[e].discussReadyRound=t),s}),await Us(n)}async function Us(n){const t=(await ke(T(R,`rooms/${n}`))).val();if(!(t!=null&&t.state)||t.state.phase!=="discuss")return;const s=t.members??{},i=Object.values(s).filter(r=>r.originalRole);td(i,t.state.roundNumber)&&await ae(T(R,`rooms/${n}`),r=>(!(r!=null&&r.state)||r.state.phase!=="discuss"||r.state.roundNumber!==t.state.roundNumber||(r.state=yo(r.state,Date.now())),r))}async function js(n){const t=(await ke(T(R,`rooms/${n}/members`))).val()??{},s=Object.values(t).filter(i=>i.originalRole);s.length===0||!s.every(i=>i.vote)||await ae(T(R,`rooms/${n}`),i=>(!(i!=null&&i.state)||i.state.phase!=="vote"||(i.state=bo(i.state)),i))}async function Eo(n){await ae(T(R,`rooms/${n}`),e=>{if(!e||!e.state)return e;const t=e.members??{};for(const s of Object.keys(t))delete t[s].originalRole,delete t[s].currentRole,delete t[s].knownRole,delete t[s].vote,delete t[s].nightReadyStep,delete t[s].discussReadyRound,delete t[s].seerReveal;return e.members=t,e.centerCards=null,e.state={...e.state,phase:"lobby",nightOrder:[],nightStepIndex:0,nightStepEndsAt:0,voteEndsAt:0},e})}function Io(n){return n.state.hostId}function Vs(n){return Io(n)===n.memberId}function bd(n){return Object.values(n.members).filter(e=>!e.left)}function le(n){return Object.values(n.members).filter(e=>e.originalRole)}function Cd(n){var e;return So((e=n.members[n.memberId])==null?void 0:e.currentRole)}function qs(n){const e=n.members[n.memberId];return So((e==null?void 0:e.knownRole)??(e==null?void 0:e.originalRole))}function So(n){if(!n)return"";const e=v[n];return`<p class="role-reminder">${e.emoji} あなたは ${e.name}</p>`}function bn(n){var t,s;const e=(t=n.members[n.memberId])==null?void 0:t.seerReveal;if(!e||e.kind==="skip")return"";if(e.kind==="player"&&((s=e.roles)!=null&&s[0])){const i=v[e.roles[0]];return`<p class="hint-text seer-memo">🦉 見たもの: ${wd(e.targetName??"?")}は ${i.emoji} ${i.name}</p>`}return e.kind==="center"&&e.roles&&e.roles.length>0?`<p class="hint-text seer-memo">🦉 見たもの: 中央カードは ${e.roles.map(r=>`${v[r].emoji} ${v[r].name}`).join(" と ")}</p>`:""}function wd(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}function Ed(n,e){var c,d;const t=Vs(e),s=bd(e),i=e.state.roleConfig,r=e.state.discussDurationMs,o=e.state.nightStepDurationMs,a=Hs(s.length,i),l=$i(s.length,i)&&s.length>=3;n.innerHTML=`
    <h2>🌙 森の夜会</h2>
    <button id="btn-leave-room" class="btn-link">← トップに戻る</button>
    <div class="room-code-box">
      部屋コード
      <div class="room-code">${e.roomId}</div>
    </div>

    <h3>参加者（${s.length}人）</h3>
    <ul class="member-list">
      ${s.map(u=>`<li>${Rd(u.name)}${u.id===Io(e)?" 👑":""}${u.online?"":"（オフライン）"}</li>`).join("")}
    </ul>

    ${t?Sd(i,a,r,o):'<p class="waiting-text">ホストの開始を待っています…</p>'}

    ${Id(i)}

    ${t?`<button id="btn-start-game" class="btn-primary" ${l?"":"disabled"}>ゲーム開始</button>
           ${s.length<3?'<p class="error-text">3人以上で開始できます</p>':""}
           ${$i(s.length,i)?"":'<p class="error-text">役職の合計枚数が多すぎます。うさぎの数がマイナスになっています。</p>'}`:""}
  `,(c=n.querySelector("#btn-leave-room"))==null||c.addEventListener("click",()=>{e.requestLeaveRoom()}),t&&(Td(n,e,i,s.length),(d=n.querySelector("#btn-start-game"))==null||d.addEventListener("click",()=>{fd(e.roomId)}))}function Id(n){const e=["villager","werewolf"];return n.seer&&e.push("seer"),n.robber&&e.push("robber"),n.minion&&e.push("minion"),`
    <h3>役職の説明</h3>
    <ul class="role-legend">
      ${e.map(t=>`<li>
            <strong>${v[t].emoji} ${v[t].name}</strong>
            <span class="hint-text">${v[t].description}</span>
          </li>`).join("")}
    </ul>
  `}function Sd(n,e,t,s){return`
    <div class="lobby-settings">
      <h3>役職構成</h3>
      <div class="setting-row">
        <span>${v.werewolf.emoji} おおかみ</span>
        <div class="stepper">
          <button data-action="wolf-dec" class="btn-step">-</button>
          <span>${n.werewolfCount}</span>
          <button data-action="wolf-inc" class="btn-step">+</button>
        </div>
      </div>
      ${Mn("seer",n.seer)}
      ${Mn("robber",n.robber)}
      ${Mn("minion",n.minion)}
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
        ${Yh.map(i=>`<button data-night-step="${i}" class="btn-toggle ${i===s?"active":""}">${i/1e3}秒</button>`).join("")}
      </div>

      <h3>議論タイマー</h3>
      <div class="setting-row">
        ${Qh.map(i=>`<button data-discuss="${i}" class="btn-toggle ${i===t?"active":""}">${i/6e4}分</button>`).join("")}
      </div>
    </div>
  `}function Mn(n,e){const t=v[n];return`
    <div class="setting-row">
      <span>${t.emoji} ${t.name}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-role-toggle="${n}" ${e?"checked":""} />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `}function Td(n,e,t,s){var r,o,a;const i=l=>void ud(e.roomId,l);(r=n.querySelector('[data-action="wolf-inc"]'))==null||r.addEventListener("click",()=>{i({...t,werewolfCount:t.werewolfCount+1})}),(o=n.querySelector('[data-action="wolf-dec"]'))==null||o.addEventListener("click",()=>{i({...t,werewolfCount:Math.max(0,t.werewolfCount-1)})}),["seer","robber","minion"].forEach(l=>{var c;(c=n.querySelector(`[data-role-toggle="${l}"]`))==null||c.addEventListener("change",d=>{const u=d.target.checked;i({...t,[l]:u})})}),n.querySelectorAll("[data-center]").forEach(l=>{l.addEventListener("click",()=>{const c=Number(l.dataset.center);i({...t,centerCount:c})})}),n.querySelectorAll("[data-night-step]").forEach(l=>{l.addEventListener("click",()=>{const c=Number(l.dataset.nightStep);pd(e.roomId,c)})}),n.querySelectorAll("[data-discuss]").forEach(l=>{l.addEventListener("click",()=>{const c=Number(l.dataset.discuss);hd(e.roomId,c)})}),(a=n.querySelector("#btn-reset-config"))==null||a.addEventListener("click",()=>{i(dd(s))})}function Rd(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}function en(n){return Vs(n)?'<button id="btn-force-reset" class="btn-danger">🚨 強制的にロビーへ戻す</button>':""}function tn(n,e){var t;(t=n.querySelector("#btn-force-reset"))==null||t.addEventListener("click",()=>{window.confirm("進行中のゲームを終了し、全員を強制的にロビーへ戻します。よろしいですか？")&&Eo(e.roomId)})}let g={roomId:"",memberId:"",step:-1,round:-1};function ne(n,e){var w,P;const t=e.state.nightStepIndex,s=e.state.roundNumber;(g.roomId!==e.roomId||g.memberId!==e.memberId||g.step!==t||g.round!==s)&&(g={roomId:e.roomId,memberId:e.memberId,step:t,round:s}),!g.centerCardsSnapshot&&e.centerCards.length>0&&(g.centerCardsSnapshot=e.centerCards);const i=e.state.nightOrder[t],r=e.members[e.memberId],o=Math.max(0,Math.ceil((e.state.nightStepEndsAt-Date.now())/1e3)),a=(r==null?void 0:r.originalRole)===i,l=g.readyTapped||((r==null?void 0:r.nightReadyStep)??-1)>=t,c=l||g.robberPending===!0,d=i==="seer"?"":bn(e),u=`
    <h2>🌙 夜がふけていく…</h2>
    <button id="btn-leave-room" class="btn-link">← トップに戻る</button>
    ${qs(e)}
    ${d}
    <div class="night-timer">${o}秒</div>
  `,h=a?l?Nd(i,e):kd(i,e):`
      <p class="waiting-text">${v[i].emoji} だれかが行動中…しずかに待とう</p>
      <p class="role-description">${v[i].name}：${v[i].description}</p>
    `,p=le(e),_=p.filter(z=>(z.nightReadyStep??-1)>=t).length;n.innerHTML=`
    ${u}
    ${h}
    <button id="btn-night-ready" class="btn-primary" ${c?"disabled":""}>
      ${l?"つぎを待っています…":g.robberPending?"交換中…":"つぎへ"}
    </button>
    <p class="hint-text">準備完了 ${_}/${p.length}人</p>
    <p class="hint-text">全員がタップすると次に進みます（役職と関係なく全員タップしてください）</p>
    ${en(e)}
  `,a&&!l&&Ad(n,i,e),(w=n.querySelector("#btn-night-ready"))==null||w.addEventListener("click",()=>{g.readyTapped||g.robberPending||(g.readyTapped=!0,ne(n,e),gd(e.roomId,e.memberId,t))}),(P=n.querySelector("#btn-leave-room"))==null||P.addEventListener("click",()=>{e.requestLeaveRoom()}),tn(n,e)}function Nd(n,e){var t;switch(n){case"werewolf":return le(e).filter(i=>i.originalRole==="werewolf").length>=2||g.wolfPeekIndex!==void 0?To(e):`<p>${v.werewolf.emoji} 中央カードは見ませんでした。</p>`;case"minion":return Ro(e);case"seer":return g.seerChoice||(t=e.members[e.memberId])!=null&&t.seerReveal?No(e):`<p>${v.seer.emoji} 何も見ませんでした。</p>`;case"robber":return g.robberResult?ko(e):`<p>${v.robber.emoji} 誰とも交換しませんでした。</p>`;case"villager":return"<p>あなたはうさぎ。することはありません。</p>"}}function kd(n,e){switch(n){case"werewolf":return To(e);case"minion":return Ro(e);case"seer":return No(e);case"robber":return ko(e);case"villager":return`
        <p>${v.villager.emoji} あなたはうさぎ。することはありません。</p>
        <p class="role-description">${v.villager.description}</p>
      `}}function To(n){const e=le(n).filter(r=>r.originalRole==="werewolf"),t=e.filter(r=>r.id!==n.memberId),s=`<p class="role-description">${v.werewolf.description}</p>`;if(e.length>=2)return`
      <p>${v.werewolf.emoji} あなたはおおかみ。仲間は…</p>
      <ul class="member-list">${t.map(r=>`<li>${We(r.name)}</li>`).join("")}</ul>
      ${s}
    `;const i=g.centerCardsSnapshot??n.centerCards;if(g.wolfPeekIndex!==void 0){const r=i[g.wolfPeekIndex];return`
      <p>${v.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
      <p>中央カード${g.wolfPeekIndex+1}は ${v[r].emoji} ${v[r].name}</p>
      ${s}
    `}return i.length===0?`
      <p>${v.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
      <p class="hint-text">中央カードを読み込み中…</p>
      ${s}
    `:`
    <p>${v.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
    <p>中央カードを1枚だけ見られます。</p>
    <div class="center-card-row">
      ${i.map((r,o)=>`<button data-center-peek="${o}" class="btn-card">中央${o+1}</button>`).join("")}
    </div>
    ${s}
  `}function Ro(n){const e=le(n).filter(t=>t.originalRole==="werewolf");return`
    <p>${v.minion.emoji} あなたは子狼。おおかみ陣営の仲間は…</p>
    ${e.length>0?`<ul class="member-list">${e.map(t=>`<li>${We(t.name)}</li>`).join("")}</ul>`:"<p>場にはおおかみがいません。あなただけがおおかみ陣営です。</p>"}
    <p class="role-description">${v.minion.description}</p>
  `}function No(n){var o,a;const e=`<p class="role-description">${v.seer.description}</p>`,t=g.centerCardsSnapshot??n.centerCards,s=(o=n.members[n.memberId])==null?void 0:o.seerReveal;if(g.seerChoice==="player"&&g.seerTargetId){const l=n.members[g.seerTargetId];return`<p>${We(l.name)}の役職は ${v[l.currentRole].emoji} ${v[l.currentRole].name}</p>${e}`}if(g.seerChoice==="center")return`<p>中央カードは ${t.map((c,d)=>d).slice(0,2).map(c=>`${v[t[c]].emoji} ${v[t[c]].name}`).join(" と ")}</p>${e}`;if(g.seerChoice==="skip")return`<p>何も見ませんでした。</p>${e}`;if(!g.seerChoice&&s){if(s.kind==="player"&&((a=s.roles)!=null&&a[0])){const l=v[s.roles[0]];return`<p>${We(s.targetName??"?")}の役職は ${l.emoji} ${l.name}</p>${e}`}if(s.kind==="center"&&s.roles)return`<p>中央カードは ${s.roles.map(c=>`${v[c].emoji} ${v[c].name}`).join(" と ")}</p>${e}`;if(s.kind==="skip")return`<p>何も見ませんでした。</p>${e}`}const i=le(n).filter(l=>l.id!==n.memberId),r=t.length>0?'<button data-seer-center class="btn-card">中央2枚を見る</button>':'<span class="hint-text">中央カードを読み込み中…</span>';return`
    <p>${v.seer.emoji} あなたはふくろう。何を見ますか？</p>
    <p class="hint-text">他の1人 か 中央カード2枚、どちらか片方だけ見られます。</p>
    <div class="member-list">
      ${i.map(l=>`<button data-seer-player="${l.id}" class="btn-card">${We(l.name)}</button>`).join("")}
    </div>
    <div class="center-card-row">
      ${r}
    </div>
    <button data-seer-skip class="btn-link">何も見ない</button>
    ${e}
  `}function ko(n){const e=`<p class="role-description">${v.robber.description}</p>`;if(g.robberResult)return`<p>${v.robber.emoji} 交換後、あなたの役職は ${v[g.robberResult].emoji} ${v[g.robberResult].name}</p>${e}`;if(g.robberPending)return`<p>${v.robber.emoji} 交換中…</p>${e}`;const t=le(n).filter(s=>s.id!==n.memberId);return`
    <p>${v.robber.emoji} あなたはきつね。誰かと役職を交換しますか？</p>
    <div class="member-list">
      ${t.map(s=>`<button data-robber-target="${s.id}" class="btn-card">${We(s.name)}</button>`).join("")}
    </div>
    <button data-robber-skip class="btn-link">だれとも交換しない</button>
    ${e}
  `}function Ad(n,e,t){var s,i,r;e==="werewolf"&&n.querySelectorAll("[data-center-peek]").forEach(o=>{o.addEventListener("click",()=>{g.wolfPeekIndex===void 0&&(g.wolfPeekIndex=Number(o.dataset.centerPeek),ne(n,t))})}),e==="seer"&&(n.querySelectorAll("[data-seer-player]").forEach(o=>{o.addEventListener("click",()=>{if(g.seerChoice)return;const a=o.dataset.seerPlayer;g.seerChoice="player",g.seerTargetId=a,ne(n,t);const l=t.members[a];On(t.roomId,t.memberId,{kind:"player",targetId:a,targetName:l.name,roles:l.currentRole?[l.currentRole]:void 0})})}),(s=n.querySelector("[data-seer-center]"))==null||s.addEventListener("click",()=>{if(g.seerChoice)return;g.seerChoice="center",ne(n,t);const o=g.centerCardsSnapshot??t.centerCards;On(t.roomId,t.memberId,{kind:"center",roles:o.slice(0,2)})}),(i=n.querySelector("[data-seer-skip]"))==null||i.addEventListener("click",()=>{g.seerChoice||(g.seerChoice="skip",ne(n,t),On(t.roomId,t.memberId,{kind:"skip"}))})),e==="robber"&&(n.querySelectorAll("[data-robber-target]").forEach(o=>{o.addEventListener("click",()=>{if(g.robberPending||g.robberResult)return;g.robberPending=!0;const a=o.dataset.robberTarget;ne(n,t),_d(t.roomId,t.memberId,a).then(l=>{g.robberPending=!1,g.robberResult=l,ne(n,t)})})}),(r=n.querySelector("[data-robber-skip]"))==null||r.addEventListener("click",()=>{g.robberPending||g.robberResult||(g.robberResult=t.members[t.memberId].currentRole,ne(n,t))}))}function We(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}let Y={roomId:"",memberId:"",round:-1};function is(n,e){var h,p,_;const t=e.state.roundNumber;(Y.roomId!==e.roomId||Y.memberId!==e.memberId||Y.round!==t)&&(Y={roomId:e.roomId,memberId:e.memberId,round:t});const s=e.members[e.memberId],i=Math.max(0,Math.ceil((e.state.discussEndsAt-Date.now())/1e3)),r=Math.floor(i/60),o=i%60,a=(s==null?void 0:s.knownRole)??(s==null?void 0:s.originalRole),l=Y.readyTapped||(s==null?void 0:s.discussReadyRound)===t,c=le(e),d=c.filter(w=>w.discussReadyRound===t).length,u=Y.hidden?'<p class="hint-text seer-memo">🙈 画面をかくしています</p>':`
      ${qs(e)}
      ${bn(e)}
      ${a?`<p class="role-description">${v[a].description}</p>`:""}
    `;n.innerHTML=`
    <h2>🗣️ 議論タイム</h2>
    <button id="btn-leave-room" class="btn-link">← トップに戻る</button>
    ${u}
    <div class="discuss-timer">${r}:${String(o).padStart(2,"0")}</div>
    <p class="hint-text">声に出して話し合おう。うそをついてもOK！</p>
    <button id="btn-toggle-hide" class="btn-secondary">${Y.hidden?"👀 表示に戻す":"🙈 画面をかくす"}</button>
    <button id="btn-discuss-ready" class="btn-primary" ${l?"disabled":""}>
      ${l?"投票を待っています…":"話し合いおわり・投票へ"}
    </button>
    <p class="hint-text">準備完了 ${d}/${c.length}人</p>
    ${en(e)}
  `,(h=n.querySelector("#btn-discuss-ready"))==null||h.addEventListener("click",()=>{Y.readyTapped||(Y.readyTapped=!0,is(n,e),yd(e.roomId,e.memberId,t))}),(p=n.querySelector("#btn-toggle-hide"))==null||p.addEventListener("click",()=>{Y.hidden=!Y.hidden,is(n,e)}),(_=n.querySelector("#btn-leave-room"))==null||_.addEventListener("click",()=>{e.requestLeaveRoom()}),tn(n,e)}function Dd(n,e){var a,l;const t=e.members[e.memberId],s=le(e),i=s.filter(c=>c.id!==e.memberId),r=Math.max(0,Math.ceil((e.state.voteEndsAt-Date.now())/1e3)),o=s.filter(c=>c.vote).length;if(!(t!=null&&t.originalRole)){n.innerHTML=`
      <h2>🗳️ 投票</h2>
      <button id="btn-leave-room" class="btn-link">← トップに戻る</button>
      <p class="waiting-text">このゲームには参加していません。結果を待ちましょう。</p>
      ${en(e)}
    `,(a=n.querySelector("#btn-leave-room"))==null||a.addEventListener("click",()=>{e.requestLeaveRoom()}),tn(n,e);return}n.innerHTML=`
    <h2>🗳️ 投票</h2>
    <button id="btn-leave-room" class="btn-link">← トップに戻る</button>
    ${qs(e)}
    ${bn(e)}
    <div class="vote-timer">${r}秒</div>
    <p class="hint-text">あやしいと思う相手に1人投票しよう（${o}/${s.length}人 投票済み）</p>
    <p class="hint-text">誰も2票以上を集めなければ、誰も脱落しません。</p>
    <div class="member-list vote-list">
      ${i.map(c=>`<button data-vote-target="${c.id}" class="btn-card ${(t==null?void 0:t.vote)===c.id?"active":""}">${Pd(c.name)}${c.online?"":"（切断中）"}</button>`).join("")}
    </div>

    <h3>勝利条件</h3>
    <ul class="role-legend">
      <li>
        <strong>🌳 森陣営（うさぎ・ふくろう・きつね）</strong>
        <span class="hint-text">おおかみを1人でも脱落させれば勝利。場におおかみが1匹もいなければ、誰も脱落させないか、子狼を脱落させれば勝利。</span>
      </li>
      <li>
        <strong>🐺 おおかみ陣営（おおかみ・子狼）</strong>
        <span class="hint-text">上の森陣営の条件を満たせなければ勝利（例: おおかみが生き残る。場におおかみがいない場合は子狼以外の誰かが脱落する）。</span>
      </li>
    </ul>
    ${en(e)}
  `,n.querySelectorAll("[data-vote-target]").forEach(c=>{c.addEventListener("click",async()=>{const d=c.dataset.voteTarget;await md(e.roomId,e.memberId,d),await js(e.roomId)})}),(l=n.querySelector("#btn-leave-room"))==null||l.addEventListener("click",()=>{e.requestLeaveRoom()}),tn(n,e)}function Pd(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}function Od(n,e){var a,l;const t=le(e),{counts:s,eliminatedIds:i}=Jh(t),r=Zh(t,i),o=new Set(i);n.innerHTML=`
    <h2>${r==="forest"?"🌳 森陣営の勝利！":"🐺 おおかみ陣営の勝利！"}</h2>
    ${Cd(e)}
    ${bn(e)}
    <p class="hint-text">${i.length>0?`脱落したのは ${i.map(c=>{var d;return Hi(((d=e.members[c])==null?void 0:d.name)??"?")}).join("、")}`:"誰も脱落しませんでした"}</p>

    <h3>みんなの最終役職</h3>
    <ul class="member-list result-list">
      ${t.map(c=>{const d=c.currentRole,u=d?v[d]:void 0;return`<li class="${o.has(c.id)?"eliminated":""}">
            ${Hi(c.name)}
            — ${u?`${u.emoji} ${u.name}`:"?"}
            <span class="vote-count">(${s[c.id]??0}票)</span>
          </li>`}).join("")}
    </ul>

    ${Vs(e)?'<button id="btn-play-again" class="btn-primary">もう一度あそぶ</button>':'<p class="waiting-text">ホストが「もう一度あそぶ」を押すのを待っています…</p>'}
    <button id="btn-leave-room" class="btn-link">トップに戻る</button>
  `,(a=n.querySelector("#btn-play-again"))==null||a.addEventListener("click",()=>{Eo(e.roomId)}),(l=n.querySelector("#btn-leave-room"))==null||l.addEventListener("click",()=>{e.requestLeaveRoom()})}function Hi(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}const ct="mori-no-yakai-session";async function Md(){try{if((await(await fetch("version.json?t="+Date.now())).json()).version!=="0.1.26"){const t=await caches.keys();await Promise.all(t.map(i=>caches.delete(i)));const s=await navigator.serviceWorker.getRegistration();s&&await s.unregister(),window.location.reload()}}catch{}}let O=null,G=null,I=null,nn={},Le=null,ut=[],xt=null;function Ao(){return{home:document.getElementById("screen-home"),lobby:document.getElementById("screen-lobby"),night:document.getElementById("screen-night"),discuss:document.getElementById("screen-discuss"),vote:document.getElementById("screen-vote"),result:document.getElementById("screen-result")}}function Do(n){const e=Ao();for(const t of Object.keys(e))e[t].classList.toggle("active",t===n)}async function Ui(n,e){const t=document.getElementById("home-error");if(t.textContent="",!e.trim()){t.textContent="なまえを入力してください";return}const s=id();try{await Co(n,s,e.trim())}catch{t.textContent="入室に失敗しました。部屋コードを確認してください。";return}O=n,G=s,localStorage.setItem(ct,JSON.stringify({roomId:n,memberId:s,name:e.trim()})),Oo()}function Po(){ut.forEach(n=>n()),ut=[],xt!==null&&(clearInterval(xt),xt=null)}function Oo(){if(!O||!G)return;const n=O;Po(),ut.push(ad(n,e=>{I=e,Ot()})),ut.push(ld(n,e=>{nn=e,Ot(),O&&((I==null?void 0:I.phase)==="night"&&Ct(O),(I==null?void 0:I.phase)==="discuss"&&Us(O),(I==null?void 0:I.phase)==="vote"&&js(O))})),ut.push(cd(n,e=>{Le=e,Ot()})),xt=setInterval(()=>{O&&(wo(O),(I==null?void 0:I.phase)==="night"&&Ct(O)),Ot()},1e3)}async function xn(){O&&G&&(await rd(O,G),wo(O),(I==null?void 0:I.phase)==="night"&&Ct(O),(I==null?void 0:I.phase)==="discuss"&&Us(O),(I==null?void 0:I.phase)==="vote"&&js(O))}function xd(){O&&G&&od(O,G),Po(),O=null,G=null,I=null,nn={},Le=null,localStorage.removeItem(ct),Do("home")}function Ot(){if(!I||!O||!G||!nn[G])return;const n=(Le==null?void 0:Le.round)===I.roundNumber?Le.cards:[],e={roomId:O,memberId:G,state:I,members:nn,centerCards:n,requestLeaveRoom:xd};Do(I.phase);const t=Ao()[I.phase];switch(I.phase){case"lobby":Ed(t,e);break;case"night":ne(t,e);break;case"discuss":is(t,e);break;case"vote":Dd(t,e);break;case"result":Od(t,e);break}}function Ld(){var e,t;(e=document.getElementById("btn-create-room"))==null||e.addEventListener("click",()=>{const s=document.getElementById("input-name").value,i=document.getElementById("home-error");if(i.textContent="",!_o()){const r=window.prompt("部屋をつくるには合言葉が必要です");if(r===null)return;if(!Uh(r)){i.textContent="合言葉が違います";return}jh()}Ui(sd(),s)}),(t=document.getElementById("btn-join-room"))==null||t.addEventListener("click",()=>{const s=document.getElementById("input-name").value,i=document.getElementById("input-room-code").value.trim().toUpperCase();if(!i){document.getElementById("home-error").textContent="部屋コードを入力してください";return}Ui(i,s)}),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&xn()}),window.addEventListener("pageshow",()=>void xn()),window.addEventListener("online",()=>void xn());const n=localStorage.getItem(ct);if(n)try{const s=JSON.parse(n);document.getElementById("input-name").value=s.name??"",s.roomId&&s.memberId&&(O=s.roomId,G=s.memberId,Co(s.roomId,s.memberId,s.name).then(()=>{Oo()}).catch(()=>{O=null,G=null,localStorage.removeItem(ct)}))}catch{localStorage.removeItem(ct)}}Ld();Md();
