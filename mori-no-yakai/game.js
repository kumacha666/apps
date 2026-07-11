(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(i){if(i.ep)return;i.ep=!0;const r=t(i);fetch(i.href,r)}})();const bo=()=>{};var Fs={};/**
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
 */const Oi={NODE_ADMIN:!1,SDK_VERSION:"${JSCORE_VERSION}"};/**
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
 */const f=function(n,e){if(!n)throw Ge(e)},Ge=function(n){return new Error("Firebase Database ("+Oi.SDK_VERSION+") INTERNAL ASSERT FAILED: "+n)};/**
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
 */const Mi=function(n){const e=[];let t=0;for(let s=0;s<n.length;s++){let i=n.charCodeAt(s);i<128?e[t++]=i:i<2048?(e[t++]=i>>6|192,e[t++]=i&63|128):(i&64512)===55296&&s+1<n.length&&(n.charCodeAt(s+1)&64512)===56320?(i=65536+((i&1023)<<10)+(n.charCodeAt(++s)&1023),e[t++]=i>>18|240,e[t++]=i>>12&63|128,e[t++]=i>>6&63|128,e[t++]=i&63|128):(e[t++]=i>>12|224,e[t++]=i>>6&63|128,e[t++]=i&63|128)}return e},Co=function(n){const e=[];let t=0,s=0;for(;t<n.length;){const i=n[t++];if(i<128)e[s++]=String.fromCharCode(i);else if(i>191&&i<224){const r=n[t++];e[s++]=String.fromCharCode((i&31)<<6|r&63)}else if(i>239&&i<365){const r=n[t++],o=n[t++],a=n[t++],l=((i&7)<<18|(r&63)<<12|(o&63)<<6|a&63)-65536;e[s++]=String.fromCharCode(55296+(l>>10)),e[s++]=String.fromCharCode(56320+(l&1023))}else{const r=n[t++],o=n[t++];e[s++]=String.fromCharCode((i&15)<<12|(r&63)<<6|o&63)}}return e.join("")},Jn={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(n,e){if(!Array.isArray(n))throw Error("encodeByteArray takes an array as a parameter");this.init_();const t=e?this.byteToCharMapWebSafe_:this.byteToCharMap_,s=[];for(let i=0;i<n.length;i+=3){const r=n[i],o=i+1<n.length,a=o?n[i+1]:0,l=i+2<n.length,c=l?n[i+2]:0,d=r>>2,u=(r&3)<<4|a>>4;let h=(a&15)<<2|c>>6,p=c&63;l||(p=64,o||(h=64)),s.push(t[d],t[u],t[h],t[p])}return s.join("")},encodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?btoa(n):this.encodeByteArray(Mi(n),e)},decodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?atob(n):Co(this.decodeStringToByteArray(n,e))},decodeStringToByteArray(n,e){this.init_();const t=e?this.charToByteMapWebSafe_:this.charToByteMap_,s=[];for(let i=0;i<n.length;){const r=t[n.charAt(i++)],a=i<n.length?t[n.charAt(i)]:0;++i;const c=i<n.length?t[n.charAt(i)]:64;++i;const u=i<n.length?t[n.charAt(i)]:64;if(++i,r==null||a==null||c==null||u==null)throw new wo;const h=r<<2|a>>4;if(s.push(h),c!==64){const p=a<<4&240|c>>2;if(s.push(p),u!==64){const _=c<<6&192|u;s.push(_)}}}return s},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let n=0;n<this.ENCODED_VALS.length;n++)this.byteToCharMap_[n]=this.ENCODED_VALS.charAt(n),this.charToByteMap_[this.byteToCharMap_[n]]=n,this.byteToCharMapWebSafe_[n]=this.ENCODED_VALS_WEBSAFE.charAt(n),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[n]]=n,n>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(n)]=n,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(n)]=n)}}};class wo extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const xi=function(n){const e=Mi(n);return Jn.encodeByteArray(e,!0)},Pt=function(n){return xi(n).replace(/\./g,"")},An=function(n){try{return Jn.decodeString(n,!0)}catch(e){console.error("base64Decode failed: ",e)}return null};/**
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
 */function Eo(n){return Li(void 0,n)}function Li(n,e){if(!(e instanceof Object))return e;switch(e.constructor){case Date:const t=e;return new Date(t.getTime());case Object:n===void 0&&(n={});break;case Array:n=[];break;default:return e}for(const t in e)!e.hasOwnProperty(t)||!Io(t)||(n[t]=Li(n[t],e[t]));return n}function Io(n){return n!=="__proto__"}/**
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
 */function So(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
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
 */const To=()=>So().__FIREBASE_DEFAULTS__,Ro=()=>{if(typeof process>"u"||typeof Fs>"u")return;const n=Fs.__FIREBASE_DEFAULTS__;if(n)return JSON.parse(n)},No=()=>{if(typeof document>"u")return;let n;try{n=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const e=n&&An(n[1]);return e&&JSON.parse(e)},Fi=()=>{try{return bo()||To()||Ro()||No()}catch(n){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${n}`);return}},ko=n=>{var e,t;return(t=(e=Fi())===null||e===void 0?void 0:e.emulatorHosts)===null||t===void 0?void 0:t[n]},Ao=n=>{const e=ko(n);if(!e)return;const t=e.lastIndexOf(":");if(t<=0||t+1===e.length)throw new Error(`Invalid host ${e} with no separate hostname and port!`);const s=parseInt(e.substring(t+1),10);return e[0]==="["?[e.substring(1,t-1),s]:[e.substring(0,t),s]},$i=()=>{var n;return(n=Fi())===null||n===void 0?void 0:n.config};/**
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
 */function Zn(n){try{return(n.startsWith("http://")||n.startsWith("https://")?new URL(n).hostname:n).endsWith(".cloudworkstations.dev")}catch{return!1}}async function Do(n){return(await fetch(n,{credentials:"include"})).ok}/**
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
 */function Po(n,e){if(n.uid)throw new Error('The "uid" field is no longer supported by mockUserToken. Please use "sub" instead for Firebase Auth User ID.');const t={alg:"none",type:"JWT"},s=e||"demo-project",i=n.iat||0,r=n.sub||n.user_id;if(!r)throw new Error("mockUserToken must contain 'sub' or 'user_id' field!");const o=Object.assign({iss:`https://securetoken.google.com/${s}`,aud:s,iat:i,exp:i+3600,auth_time:i,sub:r,user_id:r,firebase:{sign_in_provider:"custom",identities:{}}},n);return[Pt(JSON.stringify(t)),Pt(JSON.stringify(o)),""].join(".")}const tt={};function Oo(){const n={prod:[],emulator:[]};for(const e of Object.keys(tt))tt[e]?n.emulator.push(e):n.prod.push(e);return n}function Mo(n){let e=document.getElementById(n),t=!1;return e||(e=document.createElement("div"),e.setAttribute("id",n),t=!0),{created:t,element:e}}let $s=!1;function xo(n,e){if(typeof window>"u"||typeof document>"u"||!Zn(window.location.host)||tt[n]===e||tt[n]||$s)return;tt[n]=e;function t(h){return`__firebase__banner__${h}`}const s="__firebase__banner",r=Oo().prod.length>0;function o(){const h=document.getElementById(s);h&&h.remove()}function a(h){h.style.display="flex",h.style.background="#7faaf0",h.style.position="fixed",h.style.bottom="5px",h.style.left="5px",h.style.padding=".5em",h.style.borderRadius="5px",h.style.alignItems="center"}function l(h,p){h.setAttribute("width","24"),h.setAttribute("id",p),h.setAttribute("height","24"),h.setAttribute("viewBox","0 0 24 24"),h.setAttribute("fill","none"),h.style.marginLeft="-6px"}function c(){const h=document.createElement("span");return h.style.cursor="pointer",h.style.marginLeft="16px",h.style.fontSize="24px",h.innerHTML=" &times;",h.onclick=()=>{$s=!0,o()},h}function d(h,p){h.setAttribute("id",p),h.innerText="Learn more",h.href="https://firebase.google.com/docs/studio/preview-apps#preview-backend",h.setAttribute("target","__blank"),h.style.paddingLeft="5px",h.style.textDecoration="underline"}function u(){const h=Mo(s),p=t("text"),_=document.getElementById(p)||document.createElement("span"),w=t("learnmore"),O=document.getElementById(w)||document.createElement("a"),J=t("preprendIcon"),Z=document.getElementById(J)||document.createElementNS("http://www.w3.org/2000/svg","svg");if(h.created){const ge=h.element;a(ge),d(O,w);const mn=c();l(Z,J),ge.append(Z,_,O,mn),document.body.appendChild(ge)}r?(_.innerText="Preview backend disconnected.",Z.innerHTML=`<g clip-path="url(#clip0_6013_33858)">
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
 */function Lo(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function Bi(){return typeof window<"u"&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(Lo())}function Fo(){return typeof navigator=="object"&&navigator.product==="ReactNative"}function $o(){return Oi.NODE_ADMIN===!0}function Bo(){try{return typeof indexedDB=="object"}catch{return!1}}function Wo(){return new Promise((n,e)=>{try{let t=!0;const s="validate-browser-context-for-indexeddb-analytics-module",i=self.indexedDB.open(s);i.onsuccess=()=>{i.result.close(),t||self.indexedDB.deleteDatabase(s),n(!0)},i.onupgradeneeded=()=>{t=!1},i.onerror=()=>{var r;e(((r=i.error)===null||r===void 0?void 0:r.message)||"")}}catch(t){e(t)}})}/**
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
 */const Uo="FirebaseError";class vt extends Error{constructor(e,t,s){super(t),this.code=e,this.customData=s,this.name=Uo,Object.setPrototypeOf(this,vt.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,Wi.prototype.create)}}class Wi{constructor(e,t,s){this.service=e,this.serviceName=t,this.errors=s}create(e,...t){const s=t[0]||{},i=`${this.service}/${e}`,r=this.errors[e],o=r?Ho(r,s):"Error",a=`${this.serviceName}: ${o} (${i}).`;return new vt(i,a,s)}}function Ho(n,e){return n.replace(jo,(t,s)=>{const i=e[s];return i!=null?String(i):`<${s}?>`})}const jo=/\{\$([^}]+)}/g;/**
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
 */function lt(n){return JSON.parse(n)}function M(n){return JSON.stringify(n)}/**
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
 */const Ui=function(n){let e={},t={},s={},i="";try{const r=n.split(".");e=lt(An(r[0])||""),t=lt(An(r[1])||""),i=r[2],s=t.d||{},delete t.d}catch{}return{header:e,claims:t,data:s,signature:i}},Vo=function(n){const e=Ui(n),t=e.claims;return!!t&&typeof t=="object"&&t.hasOwnProperty("iat")},Go=function(n){const e=Ui(n).claims;return typeof e=="object"&&e.admin===!0};/**
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
 */function Q(n,e){return Object.prototype.hasOwnProperty.call(n,e)}function Ce(n,e){if(Object.prototype.hasOwnProperty.call(n,e))return n[e]}function Dn(n){for(const e in n)if(Object.prototype.hasOwnProperty.call(n,e))return!1;return!0}function Ot(n,e,t){const s={};for(const i in n)Object.prototype.hasOwnProperty.call(n,i)&&(s[i]=e.call(t,n[i],i,n));return s}function Mt(n,e){if(n===e)return!0;const t=Object.keys(n),s=Object.keys(e);for(const i of t){if(!s.includes(i))return!1;const r=n[i],o=e[i];if(Bs(r)&&Bs(o)){if(!Mt(r,o))return!1}else if(r!==o)return!1}for(const i of s)if(!t.includes(i))return!1;return!0}function Bs(n){return n!==null&&typeof n=="object"}/**
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
 */function qo(n){const e=[];for(const[t,s]of Object.entries(n))Array.isArray(s)?s.forEach(i=>{e.push(encodeURIComponent(t)+"="+encodeURIComponent(i))}):e.push(encodeURIComponent(t)+"="+encodeURIComponent(s));return e.length?"&"+e.join("&"):""}/**
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
 */class zo{constructor(){this.chain_=[],this.buf_=[],this.W_=[],this.pad_=[],this.inbuf_=0,this.total_=0,this.blockSize=512/8,this.pad_[0]=128;for(let e=1;e<this.blockSize;++e)this.pad_[e]=0;this.reset()}reset(){this.chain_[0]=1732584193,this.chain_[1]=4023233417,this.chain_[2]=2562383102,this.chain_[3]=271733878,this.chain_[4]=3285377520,this.inbuf_=0,this.total_=0}compress_(e,t){t||(t=0);const s=this.W_;if(typeof e=="string")for(let u=0;u<16;u++)s[u]=e.charCodeAt(t)<<24|e.charCodeAt(t+1)<<16|e.charCodeAt(t+2)<<8|e.charCodeAt(t+3),t+=4;else for(let u=0;u<16;u++)s[u]=e[t]<<24|e[t+1]<<16|e[t+2]<<8|e[t+3],t+=4;for(let u=16;u<80;u++){const h=s[u-3]^s[u-8]^s[u-14]^s[u-16];s[u]=(h<<1|h>>>31)&4294967295}let i=this.chain_[0],r=this.chain_[1],o=this.chain_[2],a=this.chain_[3],l=this.chain_[4],c,d;for(let u=0;u<80;u++){u<40?u<20?(c=a^r&(o^a),d=1518500249):(c=r^o^a,d=1859775393):u<60?(c=r&o|a&(r|o),d=2400959708):(c=r^o^a,d=3395469782);const h=(i<<5|i>>>27)+c+l+d+s[u]&4294967295;l=a,a=o,o=(r<<30|r>>>2)&4294967295,r=i,i=h}this.chain_[0]=this.chain_[0]+i&4294967295,this.chain_[1]=this.chain_[1]+r&4294967295,this.chain_[2]=this.chain_[2]+o&4294967295,this.chain_[3]=this.chain_[3]+a&4294967295,this.chain_[4]=this.chain_[4]+l&4294967295}update(e,t){if(e==null)return;t===void 0&&(t=e.length);const s=t-this.blockSize;let i=0;const r=this.buf_;let o=this.inbuf_;for(;i<t;){if(o===0)for(;i<=s;)this.compress_(e,i),i+=this.blockSize;if(typeof e=="string"){for(;i<t;)if(r[o]=e.charCodeAt(i),++o,++i,o===this.blockSize){this.compress_(r),o=0;break}}else for(;i<t;)if(r[o]=e[i],++o,++i,o===this.blockSize){this.compress_(r),o=0;break}}this.inbuf_=o,this.total_+=t}digest(){const e=[];let t=this.total_*8;this.inbuf_<56?this.update(this.pad_,56-this.inbuf_):this.update(this.pad_,this.blockSize-(this.inbuf_-56));for(let i=this.blockSize-1;i>=56;i--)this.buf_[i]=t&255,t/=256;this.compress_(this.buf_);let s=0;for(let i=0;i<5;i++)for(let r=24;r>=0;r-=8)e[s]=this.chain_[i]>>r&255,++s;return e}}function $e(n,e){return`${n} failed: ${e} argument `}/**
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
 */const Yo=function(n){const e=[];let t=0;for(let s=0;s<n.length;s++){let i=n.charCodeAt(s);if(i>=55296&&i<=56319){const r=i-55296;s++,f(s<n.length,"Surrogate pair missing trail surrogate.");const o=n.charCodeAt(s)-56320;i=65536+(r<<10)+o}i<128?e[t++]=i:i<2048?(e[t++]=i>>6|192,e[t++]=i&63|128):i<65536?(e[t++]=i>>12|224,e[t++]=i>>6&63|128,e[t++]=i&63|128):(e[t++]=i>>18|240,e[t++]=i>>12&63|128,e[t++]=i>>6&63|128,e[t++]=i&63|128)}return e},Jt=function(n){let e=0;for(let t=0;t<n.length;t++){const s=n.charCodeAt(t);s<128?e++:s<2048?e+=2:s>=55296&&s<=56319?(e+=4,t++):e+=3}return e};/**
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
 */function me(n){return n&&n._delegate?n._delegate:n}class ct{constructor(e,t,s){this.name=e,this.instanceFactory=t,this.type=s,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(e){return this.instantiationMode=e,this}setMultipleInstances(e){return this.multipleInstances=e,this}setServiceProps(e){return this.serviceProps=e,this}setInstanceCreatedCallback(e){return this.onInstanceCreated=e,this}}/**
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
 */const ye="[DEFAULT]";/**
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
 */class Ko{constructor(e,t){this.name=e,this.container=t,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(e){const t=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(t)){const s=new G;if(this.instancesDeferred.set(t,s),this.isInitialized(t)||this.shouldAutoInitialize())try{const i=this.getOrInitializeService({instanceIdentifier:t});i&&s.resolve(i)}catch{}}return this.instancesDeferred.get(t).promise}getImmediate(e){var t;const s=this.normalizeInstanceIdentifier(e==null?void 0:e.identifier),i=(t=e==null?void 0:e.optional)!==null&&t!==void 0?t:!1;if(this.isInitialized(s)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:s})}catch(r){if(i)return null;throw r}else{if(i)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(e){if(e.name!==this.name)throw Error(`Mismatching Component ${e.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=e,!!this.shouldAutoInitialize()){if(Xo(e))try{this.getOrInitializeService({instanceIdentifier:ye})}catch{}for(const[t,s]of this.instancesDeferred.entries()){const i=this.normalizeInstanceIdentifier(t);try{const r=this.getOrInitializeService({instanceIdentifier:i});s.resolve(r)}catch{}}}}clearInstance(e=ye){this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}async delete(){const e=Array.from(this.instances.values());await Promise.all([...e.filter(t=>"INTERNAL"in t).map(t=>t.INTERNAL.delete()),...e.filter(t=>"_delete"in t).map(t=>t._delete())])}isComponentSet(){return this.component!=null}isInitialized(e=ye){return this.instances.has(e)}getOptions(e=ye){return this.instancesOptions.get(e)||{}}initialize(e={}){const{options:t={}}=e,s=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(s))throw Error(`${this.name}(${s}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const i=this.getOrInitializeService({instanceIdentifier:s,options:t});for(const[r,o]of this.instancesDeferred.entries()){const a=this.normalizeInstanceIdentifier(r);s===a&&o.resolve(i)}return i}onInit(e,t){var s;const i=this.normalizeInstanceIdentifier(t),r=(s=this.onInitCallbacks.get(i))!==null&&s!==void 0?s:new Set;r.add(e),this.onInitCallbacks.set(i,r);const o=this.instances.get(i);return o&&e(o,i),()=>{r.delete(e)}}invokeOnInitCallbacks(e,t){const s=this.onInitCallbacks.get(t);if(s)for(const i of s)try{i(e,t)}catch{}}getOrInitializeService({instanceIdentifier:e,options:t={}}){let s=this.instances.get(e);if(!s&&this.component&&(s=this.component.instanceFactory(this.container,{instanceIdentifier:Qo(e),options:t}),this.instances.set(e,s),this.instancesOptions.set(e,t),this.invokeOnInitCallbacks(s,e),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,e,s)}catch{}return s||null}normalizeInstanceIdentifier(e=ye){return this.component?this.component.multipleInstances?e:ye:e}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function Qo(n){return n===ye?void 0:n}function Xo(n){return n.instantiationMode==="EAGER"}/**
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
 */class Jo{constructor(e){this.name=e,this.providers=new Map}addComponent(e){const t=this.getProvider(e.name);if(t.isComponentSet())throw new Error(`Component ${e.name} has already been registered with ${this.name}`);t.setComponent(e)}addOrOverwriteComponent(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}getProvider(e){if(this.providers.has(e))return this.providers.get(e);const t=new Ko(e,this);return this.providers.set(e,t),t}getProviders(){return Array.from(this.providers.values())}}/**
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
 */var k;(function(n){n[n.DEBUG=0]="DEBUG",n[n.VERBOSE=1]="VERBOSE",n[n.INFO=2]="INFO",n[n.WARN=3]="WARN",n[n.ERROR=4]="ERROR",n[n.SILENT=5]="SILENT"})(k||(k={}));const Zo={debug:k.DEBUG,verbose:k.VERBOSE,info:k.INFO,warn:k.WARN,error:k.ERROR,silent:k.SILENT},ea=k.INFO,ta={[k.DEBUG]:"log",[k.VERBOSE]:"log",[k.INFO]:"info",[k.WARN]:"warn",[k.ERROR]:"error"},na=(n,e,...t)=>{if(e<n.logLevel)return;const s=new Date().toISOString(),i=ta[e];if(i)console[i](`[${s}]  ${n.name}:`,...t);else throw new Error(`Attempted to log a message with an invalid logType (value: ${e})`)};class Hi{constructor(e){this.name=e,this._logLevel=ea,this._logHandler=na,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(e){if(!(e in k))throw new TypeError(`Invalid value "${e}" assigned to \`logLevel\``);this._logLevel=e}setLogLevel(e){this._logLevel=typeof e=="string"?Zo[e]:e}get logHandler(){return this._logHandler}set logHandler(e){if(typeof e!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}get userLogHandler(){return this._userLogHandler}set userLogHandler(e){this._userLogHandler=e}debug(...e){this._userLogHandler&&this._userLogHandler(this,k.DEBUG,...e),this._logHandler(this,k.DEBUG,...e)}log(...e){this._userLogHandler&&this._userLogHandler(this,k.VERBOSE,...e),this._logHandler(this,k.VERBOSE,...e)}info(...e){this._userLogHandler&&this._userLogHandler(this,k.INFO,...e),this._logHandler(this,k.INFO,...e)}warn(...e){this._userLogHandler&&this._userLogHandler(this,k.WARN,...e),this._logHandler(this,k.WARN,...e)}error(...e){this._userLogHandler&&this._userLogHandler(this,k.ERROR,...e),this._logHandler(this,k.ERROR,...e)}}const sa=(n,e)=>e.some(t=>n instanceof t);let Ws,Us;function ia(){return Ws||(Ws=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function ra(){return Us||(Us=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const ji=new WeakMap,Pn=new WeakMap,Vi=new WeakMap,gn=new WeakMap,es=new WeakMap;function oa(n){const e=new Promise((t,s)=>{const i=()=>{n.removeEventListener("success",r),n.removeEventListener("error",o)},r=()=>{t(le(n.result)),i()},o=()=>{s(n.error),i()};n.addEventListener("success",r),n.addEventListener("error",o)});return e.then(t=>{t instanceof IDBCursor&&ji.set(t,n)}).catch(()=>{}),es.set(e,n),e}function aa(n){if(Pn.has(n))return;const e=new Promise((t,s)=>{const i=()=>{n.removeEventListener("complete",r),n.removeEventListener("error",o),n.removeEventListener("abort",o)},r=()=>{t(),i()},o=()=>{s(n.error||new DOMException("AbortError","AbortError")),i()};n.addEventListener("complete",r),n.addEventListener("error",o),n.addEventListener("abort",o)});Pn.set(n,e)}let On={get(n,e,t){if(n instanceof IDBTransaction){if(e==="done")return Pn.get(n);if(e==="objectStoreNames")return n.objectStoreNames||Vi.get(n);if(e==="store")return t.objectStoreNames[1]?void 0:t.objectStore(t.objectStoreNames[0])}return le(n[e])},set(n,e,t){return n[e]=t,!0},has(n,e){return n instanceof IDBTransaction&&(e==="done"||e==="store")?!0:e in n}};function la(n){On=n(On)}function ca(n){return n===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(e,...t){const s=n.call(yn(this),e,...t);return Vi.set(s,e.sort?e.sort():[e]),le(s)}:ra().includes(n)?function(...e){return n.apply(yn(this),e),le(ji.get(this))}:function(...e){return le(n.apply(yn(this),e))}}function ua(n){return typeof n=="function"?ca(n):(n instanceof IDBTransaction&&aa(n),sa(n,ia())?new Proxy(n,On):n)}function le(n){if(n instanceof IDBRequest)return oa(n);if(gn.has(n))return gn.get(n);const e=ua(n);return e!==n&&(gn.set(n,e),es.set(e,n)),e}const yn=n=>es.get(n);function ha(n,e,{blocked:t,upgrade:s,blocking:i,terminated:r}={}){const o=indexedDB.open(n,e),a=le(o);return s&&o.addEventListener("upgradeneeded",l=>{s(le(o.result),l.oldVersion,l.newVersion,le(o.transaction),l)}),t&&o.addEventListener("blocked",l=>t(l.oldVersion,l.newVersion,l)),a.then(l=>{r&&l.addEventListener("close",()=>r()),i&&l.addEventListener("versionchange",c=>i(c.oldVersion,c.newVersion,c))}).catch(()=>{}),a}const da=["get","getKey","getAll","getAllKeys","count"],fa=["put","add","delete","clear"],vn=new Map;function Hs(n,e){if(!(n instanceof IDBDatabase&&!(e in n)&&typeof e=="string"))return;if(vn.get(e))return vn.get(e);const t=e.replace(/FromIndex$/,""),s=e!==t,i=fa.includes(t);if(!(t in(s?IDBIndex:IDBObjectStore).prototype)||!(i||da.includes(t)))return;const r=async function(o,...a){const l=this.transaction(o,i?"readwrite":"readonly");let c=l.store;return s&&(c=c.index(a.shift())),(await Promise.all([c[t](...a),i&&l.done]))[0]};return vn.set(e,r),r}la(n=>({...n,get:(e,t,s)=>Hs(e,t)||n.get(e,t,s),has:(e,t)=>!!Hs(e,t)||n.has(e,t)}));/**
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
 */class pa{constructor(e){this.container=e}getPlatformInfoString(){return this.container.getProviders().map(t=>{if(_a(t)){const s=t.getImmediate();return`${s.library}/${s.version}`}else return null}).filter(t=>t).join(" ")}}function _a(n){const e=n.getComponent();return(e==null?void 0:e.type)==="VERSION"}const Mn="@firebase/app",js="0.13.2";/**
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
 */const se=new Hi("@firebase/app"),ma="@firebase/app-compat",ga="@firebase/analytics-compat",ya="@firebase/analytics",va="@firebase/app-check-compat",ba="@firebase/app-check",Ca="@firebase/auth",wa="@firebase/auth-compat",Ea="@firebase/database",Ia="@firebase/data-connect",Sa="@firebase/database-compat",Ta="@firebase/functions",Ra="@firebase/functions-compat",Na="@firebase/installations",ka="@firebase/installations-compat",Aa="@firebase/messaging",Da="@firebase/messaging-compat",Pa="@firebase/performance",Oa="@firebase/performance-compat",Ma="@firebase/remote-config",xa="@firebase/remote-config-compat",La="@firebase/storage",Fa="@firebase/storage-compat",$a="@firebase/firestore",Ba="@firebase/ai",Wa="@firebase/firestore-compat",Ua="firebase",Ha="11.10.0";/**
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
 */const xn="[DEFAULT]",ja={[Mn]:"fire-core",[ma]:"fire-core-compat",[ya]:"fire-analytics",[ga]:"fire-analytics-compat",[ba]:"fire-app-check",[va]:"fire-app-check-compat",[Ca]:"fire-auth",[wa]:"fire-auth-compat",[Ea]:"fire-rtdb",[Ia]:"fire-data-connect",[Sa]:"fire-rtdb-compat",[Ta]:"fire-fn",[Ra]:"fire-fn-compat",[Na]:"fire-iid",[ka]:"fire-iid-compat",[Aa]:"fire-fcm",[Da]:"fire-fcm-compat",[Pa]:"fire-perf",[Oa]:"fire-perf-compat",[Ma]:"fire-rc",[xa]:"fire-rc-compat",[La]:"fire-gcs",[Fa]:"fire-gcs-compat",[$a]:"fire-fst",[Wa]:"fire-fst-compat",[Ba]:"fire-vertex","fire-js":"fire-js",[Ua]:"fire-js-all"};/**
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
 */const xt=new Map,Va=new Map,Ln=new Map;function Vs(n,e){try{n.container.addComponent(e)}catch(t){se.debug(`Component ${e.name} failed to register with FirebaseApp ${n.name}`,t)}}function Lt(n){const e=n.name;if(Ln.has(e))return se.debug(`There were multiple attempts to register component ${e}.`),!1;Ln.set(e,n);for(const t of xt.values())Vs(t,n);for(const t of Va.values())Vs(t,n);return!0}function Ga(n,e){const t=n.container.getProvider("heartbeat").getImmediate({optional:!0});return t&&t.triggerHeartbeat(),n.container.getProvider(e)}function qa(n){return n==null?!1:n.settings!==void 0}/**
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
 */const za={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},ce=new Wi("app","Firebase",za);/**
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
 */class Ya{constructor(e,t,s){this._isDeleted=!1,this._options=Object.assign({},e),this._config=Object.assign({},t),this._name=t.name,this._automaticDataCollectionEnabled=t.automaticDataCollectionEnabled,this._container=s,this.container.addComponent(new ct("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(e){this._isDeleted=e}checkDestroyed(){if(this.isDeleted)throw ce.create("app-deleted",{appName:this._name})}}/**
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
 */const Ka=Ha;function Gi(n,e={}){let t=n;typeof e!="object"&&(e={name:e});const s=Object.assign({name:xn,automaticDataCollectionEnabled:!0},e),i=s.name;if(typeof i!="string"||!i)throw ce.create("bad-app-name",{appName:String(i)});if(t||(t=$i()),!t)throw ce.create("no-options");const r=xt.get(i);if(r){if(Mt(t,r.options)&&Mt(s,r.config))return r;throw ce.create("duplicate-app",{appName:i})}const o=new Jo(i);for(const l of Ln.values())o.addComponent(l);const a=new Ya(t,s,o);return xt.set(i,a),a}function Qa(n=xn){const e=xt.get(n);if(!e&&n===xn&&$i())return Gi();if(!e)throw ce.create("no-app",{appName:n});return e}function xe(n,e,t){var s;let i=(s=ja[n])!==null&&s!==void 0?s:n;t&&(i+=`-${t}`);const r=i.match(/\s|\//),o=e.match(/\s|\//);if(r||o){const a=[`Unable to register library "${i}" with version "${e}":`];r&&a.push(`library name "${i}" contains illegal characters (whitespace or "/")`),r&&o&&a.push("and"),o&&a.push(`version name "${e}" contains illegal characters (whitespace or "/")`),se.warn(a.join(" "));return}Lt(new ct(`${i}-version`,()=>({library:i,version:e}),"VERSION"))}/**
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
 */const Xa="firebase-heartbeat-database",Ja=1,ut="firebase-heartbeat-store";let bn=null;function qi(){return bn||(bn=ha(Xa,Ja,{upgrade:(n,e)=>{switch(e){case 0:try{n.createObjectStore(ut)}catch(t){console.warn(t)}}}}).catch(n=>{throw ce.create("idb-open",{originalErrorMessage:n.message})})),bn}async function Za(n){try{const t=(await qi()).transaction(ut),s=await t.objectStore(ut).get(zi(n));return await t.done,s}catch(e){if(e instanceof vt)se.warn(e.message);else{const t=ce.create("idb-get",{originalErrorMessage:e==null?void 0:e.message});se.warn(t.message)}}}async function Gs(n,e){try{const s=(await qi()).transaction(ut,"readwrite");await s.objectStore(ut).put(e,zi(n)),await s.done}catch(t){if(t instanceof vt)se.warn(t.message);else{const s=ce.create("idb-set",{originalErrorMessage:t==null?void 0:t.message});se.warn(s.message)}}}function zi(n){return`${n.name}!${n.options.appId}`}/**
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
 */const el=1024,tl=30;class nl{constructor(e){this.container=e,this._heartbeatsCache=null;const t=this.container.getProvider("app").getImmediate();this._storage=new il(t),this._heartbeatsCachePromise=this._storage.read().then(s=>(this._heartbeatsCache=s,s))}async triggerHeartbeat(){var e,t;try{const i=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),r=qs();if(((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((t=this._heartbeatsCache)===null||t===void 0?void 0:t.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===r||this._heartbeatsCache.heartbeats.some(o=>o.date===r))return;if(this._heartbeatsCache.heartbeats.push({date:r,agent:i}),this._heartbeatsCache.heartbeats.length>tl){const o=rl(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(o,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(s){se.warn(s)}}async getHeartbeatsHeader(){var e;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((e=this._heartbeatsCache)===null||e===void 0?void 0:e.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";const t=qs(),{heartbeatsToSend:s,unsentEntries:i}=sl(this._heartbeatsCache.heartbeats),r=Pt(JSON.stringify({version:2,heartbeats:s}));return this._heartbeatsCache.lastSentHeartbeatDate=t,i.length>0?(this._heartbeatsCache.heartbeats=i,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),r}catch(t){return se.warn(t),""}}}function qs(){return new Date().toISOString().substring(0,10)}function sl(n,e=el){const t=[];let s=n.slice();for(const i of n){const r=t.find(o=>o.agent===i.agent);if(r){if(r.dates.push(i.date),zs(t)>e){r.dates.pop();break}}else if(t.push({agent:i.agent,dates:[i.date]}),zs(t)>e){t.pop();break}s=s.slice(1)}return{heartbeatsToSend:t,unsentEntries:s}}class il{constructor(e){this.app=e,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return Bo()?Wo().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const t=await Za(this.app);return t!=null&&t.heartbeats?t:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(e){var t;if(await this._canUseIndexedDBPromise){const i=await this.read();return Gs(this.app,{lastSentHeartbeatDate:(t=e.lastSentHeartbeatDate)!==null&&t!==void 0?t:i.lastSentHeartbeatDate,heartbeats:e.heartbeats})}else return}async add(e){var t;if(await this._canUseIndexedDBPromise){const i=await this.read();return Gs(this.app,{lastSentHeartbeatDate:(t=e.lastSentHeartbeatDate)!==null&&t!==void 0?t:i.lastSentHeartbeatDate,heartbeats:[...i.heartbeats,...e.heartbeats]})}else return}}function zs(n){return Pt(JSON.stringify({version:2,heartbeats:n})).length}function rl(n){if(n.length===0)return-1;let e=0,t=n[0].date;for(let s=1;s<n.length;s++)n[s].date<t&&(t=n[s].date,e=s);return e}/**
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
 */function ol(n){Lt(new ct("platform-logger",e=>new pa(e),"PRIVATE")),Lt(new ct("heartbeat",e=>new nl(e),"PRIVATE")),xe(Mn,js,n),xe(Mn,js,"esm2017"),xe("fire-js","")}ol("");var Ys={};const Ks="@firebase/database",Qs="1.0.20";/**
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
 */let Yi="";function al(n){Yi=n}/**
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
 */class ll{constructor(e){this.domStorage_=e,this.prefix_="firebase:"}set(e,t){t==null?this.domStorage_.removeItem(this.prefixedName_(e)):this.domStorage_.setItem(this.prefixedName_(e),M(t))}get(e){const t=this.domStorage_.getItem(this.prefixedName_(e));return t==null?null:lt(t)}remove(e){this.domStorage_.removeItem(this.prefixedName_(e))}prefixedName_(e){return this.prefix_+e}toString(){return this.domStorage_.toString()}}/**
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
 */class cl{constructor(){this.cache_={},this.isInMemoryStorage=!0}set(e,t){t==null?delete this.cache_[e]:this.cache_[e]=t}get(e){return Q(this.cache_,e)?this.cache_[e]:null}remove(e){delete this.cache_[e]}}/**
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
 */const Ki=function(n){try{if(typeof window<"u"&&typeof window[n]<"u"){const e=window[n];return e.setItem("firebase:sentinel","cache"),e.removeItem("firebase:sentinel"),new ll(e)}}catch{}return new cl},be=Ki("localStorage"),ul=Ki("sessionStorage");/**
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
 */const Le=new Hi("@firebase/database"),Qi=(function(){let n=1;return function(){return n++}})(),Xi=function(n){const e=Yo(n),t=new zo;t.update(e);const s=t.digest();return Jn.encodeByteArray(s)},bt=function(...n){let e="";for(let t=0;t<n.length;t++){const s=n[t];Array.isArray(s)||s&&typeof s=="object"&&typeof s.length=="number"?e+=bt.apply(null,s):typeof s=="object"?e+=M(s):e+=s,e+=" "}return e};let nt=null,Xs=!0;const hl=function(n,e){f(!0,"Can't turn on custom loggers persistently."),Le.logLevel=k.VERBOSE,nt=Le.log.bind(Le)},F=function(...n){if(Xs===!0&&(Xs=!1,nt===null&&ul.get("logging_enabled")===!0&&hl()),nt){const e=bt.apply(null,n);nt(e)}},Ct=function(n){return function(...e){F(n,...e)}},Fn=function(...n){const e="FIREBASE INTERNAL ERROR: "+bt(...n);Le.error(e)},ie=function(...n){const e=`FIREBASE FATAL ERROR: ${bt(...n)}`;throw Le.error(e),new Error(e)},W=function(...n){const e="FIREBASE WARNING: "+bt(...n);Le.warn(e)},dl=function(){typeof window<"u"&&window.location&&window.location.protocol&&window.location.protocol.indexOf("https:")!==-1&&W("Insecure Firebase access from a secure page. Please use https in calls to new Firebase().")},Zt=function(n){return typeof n=="number"&&(n!==n||n===Number.POSITIVE_INFINITY||n===Number.NEGATIVE_INFINITY)},fl=function(n){if(document.readyState==="complete")n();else{let e=!1;const t=function(){if(!document.body){setTimeout(t,Math.floor(10));return}e||(e=!0,n())};document.addEventListener?(document.addEventListener("DOMContentLoaded",t,!1),window.addEventListener("load",t,!1)):document.attachEvent&&(document.attachEvent("onreadystatechange",()=>{document.readyState==="complete"&&t()}),window.attachEvent("onload",t))}},Be="[MIN_NAME]",we="[MAX_NAME]",Te=function(n,e){if(n===e)return 0;if(n===Be||e===we)return-1;if(e===Be||n===we)return 1;{const t=Js(n),s=Js(e);return t!==null?s!==null?t-s===0?n.length-e.length:t-s:-1:s!==null?1:n<e?-1:1}},pl=function(n,e){return n===e?0:n<e?-1:1},Qe=function(n,e){if(e&&n in e)return e[n];throw new Error("Missing required key ("+n+") in object: "+M(e))},ts=function(n){if(typeof n!="object"||n===null)return M(n);const e=[];for(const s in n)e.push(s);e.sort();let t="{";for(let s=0;s<e.length;s++)s!==0&&(t+=","),t+=M(e[s]),t+=":",t+=ts(n[e[s]]);return t+="}",t},Ji=function(n,e){const t=n.length;if(t<=e)return[n];const s=[];for(let i=0;i<t;i+=e)i+e>t?s.push(n.substring(i,t)):s.push(n.substring(i,i+e));return s};function $(n,e){for(const t in n)n.hasOwnProperty(t)&&e(t,n[t])}const Zi=function(n){f(!Zt(n),"Invalid JSON number");const e=11,t=52,s=(1<<e-1)-1;let i,r,o,a,l;n===0?(r=0,o=0,i=1/n===-1/0?1:0):(i=n<0,n=Math.abs(n),n>=Math.pow(2,1-s)?(a=Math.min(Math.floor(Math.log(n)/Math.LN2),s),r=a+s,o=Math.round(n*Math.pow(2,t-a)-Math.pow(2,t))):(r=0,o=Math.round(n/Math.pow(2,1-s-t))));const c=[];for(l=t;l;l-=1)c.push(o%2?1:0),o=Math.floor(o/2);for(l=e;l;l-=1)c.push(r%2?1:0),r=Math.floor(r/2);c.push(i?1:0),c.reverse();const d=c.join("");let u="";for(l=0;l<64;l+=8){let h=parseInt(d.substr(l,8),2).toString(16);h.length===1&&(h="0"+h),u=u+h}return u.toLowerCase()},_l=function(){return!!(typeof window=="object"&&window.chrome&&window.chrome.extension&&!/^chrome/.test(window.location.href))},ml=function(){return typeof Windows=="object"&&typeof Windows.UI=="object"};function gl(n,e){let t="Unknown Error";n==="too_big"?t="The data requested exceeds the maximum size that can be accessed with a single request.":n==="permission_denied"?t="Client doesn't have permission to access the desired data.":n==="unavailable"&&(t="The service is unavailable");const s=new Error(n+" at "+e._path.toString()+": "+t);return s.code=n.toUpperCase(),s}const yl=new RegExp("^-?(0*)\\d{1,10}$"),vl=-2147483648,bl=2147483647,Js=function(n){if(yl.test(n)){const e=Number(n);if(e>=vl&&e<=bl)return e}return null},qe=function(n){try{n()}catch(e){setTimeout(()=>{const t=e.stack||"";throw W("Exception was thrown by user callback.",t),e},Math.floor(0))}},Cl=function(){return(typeof window=="object"&&window.navigator&&window.navigator.userAgent||"").search(/googlebot|google webmaster tools|bingbot|yahoo! slurp|baiduspider|yandexbot|duckduckbot/i)>=0},st=function(n,e){const t=setTimeout(n,e);return typeof t=="number"&&typeof Deno<"u"&&Deno.unrefTimer?Deno.unrefTimer(t):typeof t=="object"&&t.unref&&t.unref(),t};/**
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
 */class wl{constructor(e,t){this.appCheckProvider=t,this.appName=e.name,qa(e)&&e.settings.appCheckToken&&(this.serverAppAppCheckToken=e.settings.appCheckToken),this.appCheck=t==null?void 0:t.getImmediate({optional:!0}),this.appCheck||t==null||t.get().then(s=>this.appCheck=s)}getToken(e){if(this.serverAppAppCheckToken){if(e)throw new Error("Attempted reuse of `FirebaseServerApp.appCheckToken` after previous usage failed.");return Promise.resolve({token:this.serverAppAppCheckToken})}return this.appCheck?this.appCheck.getToken(e):new Promise((t,s)=>{setTimeout(()=>{this.appCheck?this.getToken(e).then(t,s):t(null)},0)})}addTokenChangeListener(e){var t;(t=this.appCheckProvider)===null||t===void 0||t.get().then(s=>s.addTokenListener(e))}notifyForInvalidToken(){W(`Provided AppCheck credentials for the app named "${this.appName}" are invalid. This usually indicates your app was not initialized correctly.`)}}/**
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
 */class El{constructor(e,t,s){this.appName_=e,this.firebaseOptions_=t,this.authProvider_=s,this.auth_=null,this.auth_=s.getImmediate({optional:!0}),this.auth_||s.onInit(i=>this.auth_=i)}getToken(e){return this.auth_?this.auth_.getToken(e).catch(t=>t&&t.code==="auth/token-not-initialized"?(F("Got auth/token-not-initialized error.  Treating as null token."),null):Promise.reject(t)):new Promise((t,s)=>{setTimeout(()=>{this.auth_?this.getToken(e).then(t,s):t(null)},0)})}addTokenChangeListener(e){this.auth_?this.auth_.addAuthTokenListener(e):this.authProvider_.get().then(t=>t.addAuthTokenListener(e))}removeTokenChangeListener(e){this.authProvider_.get().then(t=>t.removeAuthTokenListener(e))}notifyForInvalidToken(){let e='Provided authentication credentials for the app named "'+this.appName_+'" are invalid. This usually indicates your app was not initialized correctly. ';"credential"in this.firebaseOptions_?e+='Make sure the "credential" property provided to initializeApp() is authorized to access the specified "databaseURL" and is from the correct project.':"serviceAccount"in this.firebaseOptions_?e+='Make sure the "serviceAccount" property provided to initializeApp() is authorized to access the specified "databaseURL" and is from the correct project.':e+='Make sure the "apiKey" and "databaseURL" properties provided to initializeApp() match the values provided for your app at https://console.firebase.google.com/.',W(e)}}class At{constructor(e){this.accessToken=e}getToken(e){return Promise.resolve({accessToken:this.accessToken})}addTokenChangeListener(e){e(this.accessToken)}removeTokenChangeListener(e){}notifyForInvalidToken(){}}At.OWNER="owner";/**
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
 */const ns="5",er="v",tr="s",nr="r",sr="f",ir=/(console\.firebase|firebase-console-\w+\.corp|firebase\.corp)\.google\.com/,rr="ls",or="p",$n="ac",ar="websocket",lr="long_polling";/**
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
 */class cr{constructor(e,t,s,i,r=!1,o="",a=!1,l=!1,c=null){this.secure=t,this.namespace=s,this.webSocketOnly=i,this.nodeAdmin=r,this.persistenceKey=o,this.includeNamespaceInQueryParams=a,this.isUsingEmulator=l,this.emulatorOptions=c,this._host=e.toLowerCase(),this._domain=this._host.substr(this._host.indexOf(".")+1),this.internalHost=be.get("host:"+e)||this._host}isCacheableHost(){return this.internalHost.substr(0,2)==="s-"}isCustomHost(){return this._domain!=="firebaseio.com"&&this._domain!=="firebaseio-demo.com"}get host(){return this._host}set host(e){e!==this.internalHost&&(this.internalHost=e,this.isCacheableHost()&&be.set("host:"+this._host,this.internalHost))}toString(){let e=this.toURLString();return this.persistenceKey&&(e+="<"+this.persistenceKey+">"),e}toURLString(){const e=this.secure?"https://":"http://",t=this.includeNamespaceInQueryParams?`?ns=${this.namespace}`:"";return`${e}${this.host}/${t}`}}function Il(n){return n.host!==n.internalHost||n.isCustomHost()||n.includeNamespaceInQueryParams}function ur(n,e,t){f(typeof e=="string","typeof type must == string"),f(typeof t=="object","typeof params must == object");let s;if(e===ar)s=(n.secure?"wss://":"ws://")+n.internalHost+"/.ws?";else if(e===lr)s=(n.secure?"https://":"http://")+n.internalHost+"/.lp?";else throw new Error("Unknown connection type: "+e);Il(n)&&(t.ns=n.namespace);const i=[];return $(t,(r,o)=>{i.push(r+"="+o)}),s+i.join("&")}/**
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
 */class Sl{constructor(){this.counters_={}}incrementCounter(e,t=1){Q(this.counters_,e)||(this.counters_[e]=0),this.counters_[e]+=t}get(){return Eo(this.counters_)}}/**
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
 */const Cn={},wn={};function ss(n){const e=n.toString();return Cn[e]||(Cn[e]=new Sl),Cn[e]}function Tl(n,e){const t=n.toString();return wn[t]||(wn[t]=e()),wn[t]}/**
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
 */class Rl{constructor(e){this.onMessage_=e,this.pendingResponses=[],this.currentResponseNum=0,this.closeAfterResponse=-1,this.onClose=null}closeAfter(e,t){this.closeAfterResponse=e,this.onClose=t,this.closeAfterResponse<this.currentResponseNum&&(this.onClose(),this.onClose=null)}handleResponse(e,t){for(this.pendingResponses[e]=t;this.pendingResponses[this.currentResponseNum];){const s=this.pendingResponses[this.currentResponseNum];delete this.pendingResponses[this.currentResponseNum];for(let i=0;i<s.length;++i)s[i]&&qe(()=>{this.onMessage_(s[i])});if(this.currentResponseNum===this.closeAfterResponse){this.onClose&&(this.onClose(),this.onClose=null);break}this.currentResponseNum++}}}/**
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
 */const Zs="start",Nl="close",kl="pLPCommand",Al="pRTLPCB",hr="id",dr="pw",fr="ser",Dl="cb",Pl="seg",Ol="ts",Ml="d",xl="dframe",pr=1870,_r=30,Ll=pr-_r,Fl=25e3,$l=3e4;class Pe{constructor(e,t,s,i,r,o,a){this.connId=e,this.repoInfo=t,this.applicationId=s,this.appCheckToken=i,this.authToken=r,this.transportSessionId=o,this.lastSessionId=a,this.bytesSent=0,this.bytesReceived=0,this.everConnected_=!1,this.log_=Ct(e),this.stats_=ss(t),this.urlFn=l=>(this.appCheckToken&&(l[$n]=this.appCheckToken),ur(t,lr,l))}open(e,t){this.curSegmentNum=0,this.onDisconnect_=t,this.myPacketOrderer=new Rl(e),this.isClosed_=!1,this.connectTimeoutTimer_=setTimeout(()=>{this.log_("Timed out trying to connect."),this.onClosed_(),this.connectTimeoutTimer_=null},Math.floor($l)),fl(()=>{if(this.isClosed_)return;this.scriptTagHolder=new is((...r)=>{const[o,a,l,c,d]=r;if(this.incrementIncomingBytes_(r),!!this.scriptTagHolder)if(this.connectTimeoutTimer_&&(clearTimeout(this.connectTimeoutTimer_),this.connectTimeoutTimer_=null),this.everConnected_=!0,o===Zs)this.id=a,this.password=l;else if(o===Nl)a?(this.scriptTagHolder.sendNewPolls=!1,this.myPacketOrderer.closeAfter(a,()=>{this.onClosed_()})):this.onClosed_();else throw new Error("Unrecognized command received: "+o)},(...r)=>{const[o,a]=r;this.incrementIncomingBytes_(r),this.myPacketOrderer.handleResponse(o,a)},()=>{this.onClosed_()},this.urlFn);const s={};s[Zs]="t",s[fr]=Math.floor(Math.random()*1e8),this.scriptTagHolder.uniqueCallbackIdentifier&&(s[Dl]=this.scriptTagHolder.uniqueCallbackIdentifier),s[er]=ns,this.transportSessionId&&(s[tr]=this.transportSessionId),this.lastSessionId&&(s[rr]=this.lastSessionId),this.applicationId&&(s[or]=this.applicationId),this.appCheckToken&&(s[$n]=this.appCheckToken),typeof location<"u"&&location.hostname&&ir.test(location.hostname)&&(s[nr]=sr);const i=this.urlFn(s);this.log_("Connecting via long-poll to "+i),this.scriptTagHolder.addTag(i,()=>{})})}start(){this.scriptTagHolder.startLongPoll(this.id,this.password),this.addDisconnectPingFrame(this.id,this.password)}static forceAllow(){Pe.forceAllow_=!0}static forceDisallow(){Pe.forceDisallow_=!0}static isAvailable(){return Pe.forceAllow_?!0:!Pe.forceDisallow_&&typeof document<"u"&&document.createElement!=null&&!_l()&&!ml()}markConnectionHealthy(){}shutdown_(){this.isClosed_=!0,this.scriptTagHolder&&(this.scriptTagHolder.close(),this.scriptTagHolder=null),this.myDisconnFrame&&(document.body.removeChild(this.myDisconnFrame),this.myDisconnFrame=null),this.connectTimeoutTimer_&&(clearTimeout(this.connectTimeoutTimer_),this.connectTimeoutTimer_=null)}onClosed_(){this.isClosed_||(this.log_("Longpoll is closing itself"),this.shutdown_(),this.onDisconnect_&&(this.onDisconnect_(this.everConnected_),this.onDisconnect_=null))}close(){this.isClosed_||(this.log_("Longpoll is being closed."),this.shutdown_())}send(e){const t=M(e);this.bytesSent+=t.length,this.stats_.incrementCounter("bytes_sent",t.length);const s=xi(t),i=Ji(s,Ll);for(let r=0;r<i.length;r++)this.scriptTagHolder.enqueueSegment(this.curSegmentNum,i.length,i[r]),this.curSegmentNum++}addDisconnectPingFrame(e,t){this.myDisconnFrame=document.createElement("iframe");const s={};s[xl]="t",s[hr]=e,s[dr]=t,this.myDisconnFrame.src=this.urlFn(s),this.myDisconnFrame.style.display="none",document.body.appendChild(this.myDisconnFrame)}incrementIncomingBytes_(e){const t=M(e).length;this.bytesReceived+=t,this.stats_.incrementCounter("bytes_received",t)}}class is{constructor(e,t,s,i){this.onDisconnect=s,this.urlFn=i,this.outstandingRequests=new Set,this.pendingSegs=[],this.currentSerial=Math.floor(Math.random()*1e8),this.sendNewPolls=!0;{this.uniqueCallbackIdentifier=Qi(),window[kl+this.uniqueCallbackIdentifier]=e,window[Al+this.uniqueCallbackIdentifier]=t,this.myIFrame=is.createIFrame_();let r="";this.myIFrame.src&&this.myIFrame.src.substr(0,11)==="javascript:"&&(r='<script>document.domain="'+document.domain+'";<\/script>');const o="<html><body>"+r+"</body></html>";try{this.myIFrame.doc.open(),this.myIFrame.doc.write(o),this.myIFrame.doc.close()}catch(a){F("frame writing exception"),a.stack&&F(a.stack),F(a)}}}static createIFrame_(){const e=document.createElement("iframe");if(e.style.display="none",document.body){document.body.appendChild(e);try{e.contentWindow.document||F("No IE domain setting required")}catch{const s=document.domain;e.src="javascript:void((function(){document.open();document.domain='"+s+"';document.close();})())"}}else throw"Document body has not initialized. Wait to initialize Firebase until after the document is ready.";return e.contentDocument?e.doc=e.contentDocument:e.contentWindow?e.doc=e.contentWindow.document:e.document&&(e.doc=e.document),e}close(){this.alive=!1,this.myIFrame&&(this.myIFrame.doc.body.textContent="",setTimeout(()=>{this.myIFrame!==null&&(document.body.removeChild(this.myIFrame),this.myIFrame=null)},Math.floor(0)));const e=this.onDisconnect;e&&(this.onDisconnect=null,e())}startLongPoll(e,t){for(this.myID=e,this.myPW=t,this.alive=!0;this.newRequest_(););}newRequest_(){if(this.alive&&this.sendNewPolls&&this.outstandingRequests.size<(this.pendingSegs.length>0?2:1)){this.currentSerial++;const e={};e[hr]=this.myID,e[dr]=this.myPW,e[fr]=this.currentSerial;let t=this.urlFn(e),s="",i=0;for(;this.pendingSegs.length>0&&this.pendingSegs[0].d.length+_r+s.length<=pr;){const o=this.pendingSegs.shift();s=s+"&"+Pl+i+"="+o.seg+"&"+Ol+i+"="+o.ts+"&"+Ml+i+"="+o.d,i++}return t=t+s,this.addLongPollTag_(t,this.currentSerial),!0}else return!1}enqueueSegment(e,t,s){this.pendingSegs.push({seg:e,ts:t,d:s}),this.alive&&this.newRequest_()}addLongPollTag_(e,t){this.outstandingRequests.add(t);const s=()=>{this.outstandingRequests.delete(t),this.newRequest_()},i=setTimeout(s,Math.floor(Fl)),r=()=>{clearTimeout(i),s()};this.addTag(e,r)}addTag(e,t){setTimeout(()=>{try{if(!this.sendNewPolls)return;const s=this.myIFrame.doc.createElement("script");s.type="text/javascript",s.async=!0,s.src=e,s.onload=s.onreadystatechange=function(){const i=s.readyState;(!i||i==="loaded"||i==="complete")&&(s.onload=s.onreadystatechange=null,s.parentNode&&s.parentNode.removeChild(s),t())},s.onerror=()=>{F("Long-poll script failed to load: "+e),this.sendNewPolls=!1,this.close()},this.myIFrame.doc.body.appendChild(s)}catch{}},Math.floor(1))}}/**
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
 */const Bl=16384,Wl=45e3;let Ft=null;typeof MozWebSocket<"u"?Ft=MozWebSocket:typeof WebSocket<"u"&&(Ft=WebSocket);class q{constructor(e,t,s,i,r,o,a){this.connId=e,this.applicationId=s,this.appCheckToken=i,this.authToken=r,this.keepaliveTimer=null,this.frames=null,this.totalFrames=0,this.bytesSent=0,this.bytesReceived=0,this.log_=Ct(this.connId),this.stats_=ss(t),this.connURL=q.connectionURL_(t,o,a,i,s),this.nodeAdmin=t.nodeAdmin}static connectionURL_(e,t,s,i,r){const o={};return o[er]=ns,typeof location<"u"&&location.hostname&&ir.test(location.hostname)&&(o[nr]=sr),t&&(o[tr]=t),s&&(o[rr]=s),i&&(o[$n]=i),r&&(o[or]=r),ur(e,ar,o)}open(e,t){this.onDisconnect=t,this.onMessage=e,this.log_("Websocket connecting to "+this.connURL),this.everConnected_=!1,be.set("previous_websocket_failure",!0);try{let s;$o(),this.mySock=new Ft(this.connURL,[],s)}catch(s){this.log_("Error instantiating WebSocket.");const i=s.message||s.data;i&&this.log_(i),this.onClosed_();return}this.mySock.onopen=()=>{this.log_("Websocket connected."),this.everConnected_=!0},this.mySock.onclose=()=>{this.log_("Websocket connection was disconnected."),this.mySock=null,this.onClosed_()},this.mySock.onmessage=s=>{this.handleIncomingFrame(s)},this.mySock.onerror=s=>{this.log_("WebSocket error.  Closing connection.");const i=s.message||s.data;i&&this.log_(i),this.onClosed_()}}start(){}static forceDisallow(){q.forceDisallow_=!0}static isAvailable(){let e=!1;if(typeof navigator<"u"&&navigator.userAgent){const t=/Android ([0-9]{0,}\.[0-9]{0,})/,s=navigator.userAgent.match(t);s&&s.length>1&&parseFloat(s[1])<4.4&&(e=!0)}return!e&&Ft!==null&&!q.forceDisallow_}static previouslyFailed(){return be.isInMemoryStorage||be.get("previous_websocket_failure")===!0}markConnectionHealthy(){be.remove("previous_websocket_failure")}appendFrame_(e){if(this.frames.push(e),this.frames.length===this.totalFrames){const t=this.frames.join("");this.frames=null;const s=lt(t);this.onMessage(s)}}handleNewFrameCount_(e){this.totalFrames=e,this.frames=[]}extractFrameCount_(e){if(f(this.frames===null,"We already have a frame buffer"),e.length<=6){const t=Number(e);if(!isNaN(t))return this.handleNewFrameCount_(t),null}return this.handleNewFrameCount_(1),e}handleIncomingFrame(e){if(this.mySock===null)return;const t=e.data;if(this.bytesReceived+=t.length,this.stats_.incrementCounter("bytes_received",t.length),this.resetKeepAlive(),this.frames!==null)this.appendFrame_(t);else{const s=this.extractFrameCount_(t);s!==null&&this.appendFrame_(s)}}send(e){this.resetKeepAlive();const t=M(e);this.bytesSent+=t.length,this.stats_.incrementCounter("bytes_sent",t.length);const s=Ji(t,Bl);s.length>1&&this.sendString_(String(s.length));for(let i=0;i<s.length;i++)this.sendString_(s[i])}shutdown_(){this.isClosed_=!0,this.keepaliveTimer&&(clearInterval(this.keepaliveTimer),this.keepaliveTimer=null),this.mySock&&(this.mySock.close(),this.mySock=null)}onClosed_(){this.isClosed_||(this.log_("WebSocket is closing itself"),this.shutdown_(),this.onDisconnect&&(this.onDisconnect(this.everConnected_),this.onDisconnect=null))}close(){this.isClosed_||(this.log_("WebSocket is being closed"),this.shutdown_())}resetKeepAlive(){clearInterval(this.keepaliveTimer),this.keepaliveTimer=setInterval(()=>{this.mySock&&this.sendString_("0"),this.resetKeepAlive()},Math.floor(Wl))}sendString_(e){try{this.mySock.send(e)}catch(t){this.log_("Exception thrown from WebSocket.send():",t.message||t.data,"Closing connection."),setTimeout(this.onClosed_.bind(this),0)}}}q.responsesRequiredToBeHealthy=2;q.healthyTimeout=3e4;/**
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
 */class ht{static get ALL_TRANSPORTS(){return[Pe,q]}static get IS_TRANSPORT_INITIALIZED(){return this.globalTransportInitialized_}constructor(e){this.initTransports_(e)}initTransports_(e){const t=q&&q.isAvailable();let s=t&&!q.previouslyFailed();if(e.webSocketOnly&&(t||W("wss:// URL used, but browser isn't known to support websockets.  Trying anyway."),s=!0),s)this.transports_=[q];else{const i=this.transports_=[];for(const r of ht.ALL_TRANSPORTS)r&&r.isAvailable()&&i.push(r);ht.globalTransportInitialized_=!0}}initialTransport(){if(this.transports_.length>0)return this.transports_[0];throw new Error("No transports available")}upgradeTransport(){return this.transports_.length>1?this.transports_[1]:null}}ht.globalTransportInitialized_=!1;/**
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
 */const Ul=6e4,Hl=5e3,jl=10*1024,Vl=100*1024,En="t",ei="d",Gl="s",ti="r",ql="e",ni="o",si="a",ii="n",ri="p",zl="h";class Yl{constructor(e,t,s,i,r,o,a,l,c,d){this.id=e,this.repoInfo_=t,this.applicationId_=s,this.appCheckToken_=i,this.authToken_=r,this.onMessage_=o,this.onReady_=a,this.onDisconnect_=l,this.onKill_=c,this.lastSessionId=d,this.connectionCount=0,this.pendingDataMessages=[],this.state_=0,this.log_=Ct("c:"+this.id+":"),this.transportManager_=new ht(t),this.log_("Connection created"),this.start_()}start_(){const e=this.transportManager_.initialTransport();this.conn_=new e(this.nextTransportId_(),this.repoInfo_,this.applicationId_,this.appCheckToken_,this.authToken_,null,this.lastSessionId),this.primaryResponsesRequired_=e.responsesRequiredToBeHealthy||0;const t=this.connReceiver_(this.conn_),s=this.disconnReceiver_(this.conn_);this.tx_=this.conn_,this.rx_=this.conn_,this.secondaryConn_=null,this.isHealthy_=!1,setTimeout(()=>{this.conn_&&this.conn_.open(t,s)},Math.floor(0));const i=e.healthyTimeout||0;i>0&&(this.healthyTimeout_=st(()=>{this.healthyTimeout_=null,this.isHealthy_||(this.conn_&&this.conn_.bytesReceived>Vl?(this.log_("Connection exceeded healthy timeout but has received "+this.conn_.bytesReceived+" bytes.  Marking connection healthy."),this.isHealthy_=!0,this.conn_.markConnectionHealthy()):this.conn_&&this.conn_.bytesSent>jl?this.log_("Connection exceeded healthy timeout but has sent "+this.conn_.bytesSent+" bytes.  Leaving connection alive."):(this.log_("Closing unhealthy connection after timeout."),this.close()))},Math.floor(i)))}nextTransportId_(){return"c:"+this.id+":"+this.connectionCount++}disconnReceiver_(e){return t=>{e===this.conn_?this.onConnectionLost_(t):e===this.secondaryConn_?(this.log_("Secondary connection lost."),this.onSecondaryConnectionLost_()):this.log_("closing an old connection")}}connReceiver_(e){return t=>{this.state_!==2&&(e===this.rx_?this.onPrimaryMessageReceived_(t):e===this.secondaryConn_?this.onSecondaryMessageReceived_(t):this.log_("message on old connection"))}}sendRequest(e){const t={t:"d",d:e};this.sendData_(t)}tryCleanupConnection(){this.tx_===this.secondaryConn_&&this.rx_===this.secondaryConn_&&(this.log_("cleaning up and promoting a connection: "+this.secondaryConn_.connId),this.conn_=this.secondaryConn_,this.secondaryConn_=null)}onSecondaryControl_(e){if(En in e){const t=e[En];t===si?this.upgradeIfSecondaryHealthy_():t===ti?(this.log_("Got a reset on secondary, closing it"),this.secondaryConn_.close(),(this.tx_===this.secondaryConn_||this.rx_===this.secondaryConn_)&&this.close()):t===ni&&(this.log_("got pong on secondary."),this.secondaryResponsesRequired_--,this.upgradeIfSecondaryHealthy_())}}onSecondaryMessageReceived_(e){const t=Qe("t",e),s=Qe("d",e);if(t==="c")this.onSecondaryControl_(s);else if(t==="d")this.pendingDataMessages.push(s);else throw new Error("Unknown protocol layer: "+t)}upgradeIfSecondaryHealthy_(){this.secondaryResponsesRequired_<=0?(this.log_("Secondary connection is healthy."),this.isHealthy_=!0,this.secondaryConn_.markConnectionHealthy(),this.proceedWithUpgrade_()):(this.log_("sending ping on secondary."),this.secondaryConn_.send({t:"c",d:{t:ri,d:{}}}))}proceedWithUpgrade_(){this.secondaryConn_.start(),this.log_("sending client ack on secondary"),this.secondaryConn_.send({t:"c",d:{t:si,d:{}}}),this.log_("Ending transmission on primary"),this.conn_.send({t:"c",d:{t:ii,d:{}}}),this.tx_=this.secondaryConn_,this.tryCleanupConnection()}onPrimaryMessageReceived_(e){const t=Qe("t",e),s=Qe("d",e);t==="c"?this.onControl_(s):t==="d"&&this.onDataMessage_(s)}onDataMessage_(e){this.onPrimaryResponse_(),this.onMessage_(e)}onPrimaryResponse_(){this.isHealthy_||(this.primaryResponsesRequired_--,this.primaryResponsesRequired_<=0&&(this.log_("Primary connection is healthy."),this.isHealthy_=!0,this.conn_.markConnectionHealthy()))}onControl_(e){const t=Qe(En,e);if(ei in e){const s=e[ei];if(t===zl){const i=Object.assign({},s);this.repoInfo_.isUsingEmulator&&(i.h=this.repoInfo_.host),this.onHandshake_(i)}else if(t===ii){this.log_("recvd end transmission on primary"),this.rx_=this.secondaryConn_;for(let i=0;i<this.pendingDataMessages.length;++i)this.onDataMessage_(this.pendingDataMessages[i]);this.pendingDataMessages=[],this.tryCleanupConnection()}else t===Gl?this.onConnectionShutdown_(s):t===ti?this.onReset_(s):t===ql?Fn("Server Error: "+s):t===ni?(this.log_("got pong on primary."),this.onPrimaryResponse_(),this.sendPingOnPrimaryIfNecessary_()):Fn("Unknown control packet command: "+t)}}onHandshake_(e){const t=e.ts,s=e.v,i=e.h;this.sessionId=e.s,this.repoInfo_.host=i,this.state_===0&&(this.conn_.start(),this.onConnectionEstablished_(this.conn_,t),ns!==s&&W("Protocol version mismatch detected"),this.tryStartUpgrade_())}tryStartUpgrade_(){const e=this.transportManager_.upgradeTransport();e&&this.startUpgrade_(e)}startUpgrade_(e){this.secondaryConn_=new e(this.nextTransportId_(),this.repoInfo_,this.applicationId_,this.appCheckToken_,this.authToken_,this.sessionId),this.secondaryResponsesRequired_=e.responsesRequiredToBeHealthy||0;const t=this.connReceiver_(this.secondaryConn_),s=this.disconnReceiver_(this.secondaryConn_);this.secondaryConn_.open(t,s),st(()=>{this.secondaryConn_&&(this.log_("Timed out trying to upgrade."),this.secondaryConn_.close())},Math.floor(Ul))}onReset_(e){this.log_("Reset packet received.  New host: "+e),this.repoInfo_.host=e,this.state_===1?this.close():(this.closeConnections_(),this.start_())}onConnectionEstablished_(e,t){this.log_("Realtime connection established."),this.conn_=e,this.state_=1,this.onReady_&&(this.onReady_(t,this.sessionId),this.onReady_=null),this.primaryResponsesRequired_===0?(this.log_("Primary connection is healthy."),this.isHealthy_=!0):st(()=>{this.sendPingOnPrimaryIfNecessary_()},Math.floor(Hl))}sendPingOnPrimaryIfNecessary_(){!this.isHealthy_&&this.state_===1&&(this.log_("sending ping on primary."),this.sendData_({t:"c",d:{t:ri,d:{}}}))}onSecondaryConnectionLost_(){const e=this.secondaryConn_;this.secondaryConn_=null,(this.tx_===e||this.rx_===e)&&this.close()}onConnectionLost_(e){this.conn_=null,!e&&this.state_===0?(this.log_("Realtime connection failed."),this.repoInfo_.isCacheableHost()&&(be.remove("host:"+this.repoInfo_.host),this.repoInfo_.internalHost=this.repoInfo_.host)):this.state_===1&&this.log_("Realtime connection lost."),this.close()}onConnectionShutdown_(e){this.log_("Connection shutdown command received. Shutting down..."),this.onKill_&&(this.onKill_(e),this.onKill_=null),this.onDisconnect_=null,this.close()}sendData_(e){if(this.state_!==1)throw"Connection is not connected";this.tx_.send(e)}close(){this.state_!==2&&(this.log_("Closing realtime connection."),this.state_=2,this.closeConnections_(),this.onDisconnect_&&(this.onDisconnect_(),this.onDisconnect_=null))}closeConnections_(){this.log_("Shutting down all connections"),this.conn_&&(this.conn_.close(),this.conn_=null),this.secondaryConn_&&(this.secondaryConn_.close(),this.secondaryConn_=null),this.healthyTimeout_&&(clearTimeout(this.healthyTimeout_),this.healthyTimeout_=null)}}/**
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
 */class mr{put(e,t,s,i){}merge(e,t,s,i){}refreshAuthToken(e){}refreshAppCheckToken(e){}onDisconnectPut(e,t,s){}onDisconnectMerge(e,t,s){}onDisconnectCancel(e,t){}reportStats(e){}}/**
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
 */class gr{constructor(e){this.allowedEvents_=e,this.listeners_={},f(Array.isArray(e)&&e.length>0,"Requires a non-empty array")}trigger(e,...t){if(Array.isArray(this.listeners_[e])){const s=[...this.listeners_[e]];for(let i=0;i<s.length;i++)s[i].callback.apply(s[i].context,t)}}on(e,t,s){this.validateEventType_(e),this.listeners_[e]=this.listeners_[e]||[],this.listeners_[e].push({callback:t,context:s});const i=this.getInitialEvent(e);i&&t.apply(s,i)}off(e,t,s){this.validateEventType_(e);const i=this.listeners_[e]||[];for(let r=0;r<i.length;r++)if(i[r].callback===t&&(!s||s===i[r].context)){i.splice(r,1);return}}validateEventType_(e){f(this.allowedEvents_.find(t=>t===e),"Unknown event: "+e)}}/**
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
 */class $t extends gr{static getInstance(){return new $t}constructor(){super(["online"]),this.online_=!0,typeof window<"u"&&typeof window.addEventListener<"u"&&!Bi()&&(window.addEventListener("online",()=>{this.online_||(this.online_=!0,this.trigger("online",!0))},!1),window.addEventListener("offline",()=>{this.online_&&(this.online_=!1,this.trigger("online",!1))},!1))}getInitialEvent(e){return f(e==="online","Unknown event type: "+e),[this.online_]}currentlyOnline(){return this.online_}}/**
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
 */const oi=32,ai=768;class I{constructor(e,t){if(t===void 0){this.pieces_=e.split("/");let s=0;for(let i=0;i<this.pieces_.length;i++)this.pieces_[i].length>0&&(this.pieces_[s]=this.pieces_[i],s++);this.pieces_.length=s,this.pieceNum_=0}else this.pieces_=e,this.pieceNum_=t}toString(){let e="";for(let t=this.pieceNum_;t<this.pieces_.length;t++)this.pieces_[t]!==""&&(e+="/"+this.pieces_[t]);return e||"/"}}function E(){return new I("")}function y(n){return n.pieceNum_>=n.pieces_.length?null:n.pieces_[n.pieceNum_]}function de(n){return n.pieces_.length-n.pieceNum_}function S(n){let e=n.pieceNum_;return e<n.pieces_.length&&e++,new I(n.pieces_,e)}function rs(n){return n.pieceNum_<n.pieces_.length?n.pieces_[n.pieces_.length-1]:null}function Kl(n){let e="";for(let t=n.pieceNum_;t<n.pieces_.length;t++)n.pieces_[t]!==""&&(e+="/"+encodeURIComponent(String(n.pieces_[t])));return e||"/"}function dt(n,e=0){return n.pieces_.slice(n.pieceNum_+e)}function yr(n){if(n.pieceNum_>=n.pieces_.length)return null;const e=[];for(let t=n.pieceNum_;t<n.pieces_.length-1;t++)e.push(n.pieces_[t]);return new I(e,0)}function P(n,e){const t=[];for(let s=n.pieceNum_;s<n.pieces_.length;s++)t.push(n.pieces_[s]);if(e instanceof I)for(let s=e.pieceNum_;s<e.pieces_.length;s++)t.push(e.pieces_[s]);else{const s=e.split("/");for(let i=0;i<s.length;i++)s[i].length>0&&t.push(s[i])}return new I(t,0)}function v(n){return n.pieceNum_>=n.pieces_.length}function B(n,e){const t=y(n),s=y(e);if(t===null)return e;if(t===s)return B(S(n),S(e));throw new Error("INTERNAL ERROR: innerPath ("+e+") is not within outerPath ("+n+")")}function Ql(n,e){const t=dt(n,0),s=dt(e,0);for(let i=0;i<t.length&&i<s.length;i++){const r=Te(t[i],s[i]);if(r!==0)return r}return t.length===s.length?0:t.length<s.length?-1:1}function os(n,e){if(de(n)!==de(e))return!1;for(let t=n.pieceNum_,s=e.pieceNum_;t<=n.pieces_.length;t++,s++)if(n.pieces_[t]!==e.pieces_[s])return!1;return!0}function V(n,e){let t=n.pieceNum_,s=e.pieceNum_;if(de(n)>de(e))return!1;for(;t<n.pieces_.length;){if(n.pieces_[t]!==e.pieces_[s])return!1;++t,++s}return!0}class Xl{constructor(e,t){this.errorPrefix_=t,this.parts_=dt(e,0),this.byteLength_=Math.max(1,this.parts_.length);for(let s=0;s<this.parts_.length;s++)this.byteLength_+=Jt(this.parts_[s]);vr(this)}}function Jl(n,e){n.parts_.length>0&&(n.byteLength_+=1),n.parts_.push(e),n.byteLength_+=Jt(e),vr(n)}function Zl(n){const e=n.parts_.pop();n.byteLength_-=Jt(e),n.parts_.length>0&&(n.byteLength_-=1)}function vr(n){if(n.byteLength_>ai)throw new Error(n.errorPrefix_+"has a key path longer than "+ai+" bytes ("+n.byteLength_+").");if(n.parts_.length>oi)throw new Error(n.errorPrefix_+"path specified exceeds the maximum depth that can be written ("+oi+") or object contains a cycle "+ve(n))}function ve(n){return n.parts_.length===0?"":"in property '"+n.parts_.join(".")+"'"}/**
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
 */class as extends gr{static getInstance(){return new as}constructor(){super(["visible"]);let e,t;typeof document<"u"&&typeof document.addEventListener<"u"&&(typeof document.hidden<"u"?(t="visibilitychange",e="hidden"):typeof document.mozHidden<"u"?(t="mozvisibilitychange",e="mozHidden"):typeof document.msHidden<"u"?(t="msvisibilitychange",e="msHidden"):typeof document.webkitHidden<"u"&&(t="webkitvisibilitychange",e="webkitHidden")),this.visible_=!0,t&&document.addEventListener(t,()=>{const s=!document[e];s!==this.visible_&&(this.visible_=s,this.trigger("visible",s))},!1)}getInitialEvent(e){return f(e==="visible","Unknown event type: "+e),[this.visible_]}}/**
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
 */const Xe=1e3,ec=300*1e3,li=30*1e3,tc=1.3,nc=3e4,sc="server_kill",ci=3;class ne extends mr{constructor(e,t,s,i,r,o,a,l){if(super(),this.repoInfo_=e,this.applicationId_=t,this.onDataUpdate_=s,this.onConnectStatus_=i,this.onServerInfoUpdate_=r,this.authTokenProvider_=o,this.appCheckTokenProvider_=a,this.authOverride_=l,this.id=ne.nextPersistentConnectionId_++,this.log_=Ct("p:"+this.id+":"),this.interruptReasons_={},this.listens=new Map,this.outstandingPuts_=[],this.outstandingGets_=[],this.outstandingPutCount_=0,this.outstandingGetCount_=0,this.onDisconnectRequestQueue_=[],this.connected_=!1,this.reconnectDelay_=Xe,this.maxReconnectDelay_=ec,this.securityDebugCallback_=null,this.lastSessionId=null,this.establishConnectionTimer_=null,this.visible_=!1,this.requestCBHash_={},this.requestNumber_=0,this.realtime_=null,this.authToken_=null,this.appCheckToken_=null,this.forceTokenRefresh_=!1,this.invalidAuthTokenCount_=0,this.invalidAppCheckTokenCount_=0,this.firstConnection_=!0,this.lastConnectionAttemptTime_=null,this.lastConnectionEstablishedTime_=null,l)throw new Error("Auth override specified in options, but not supported on non Node.js platforms");as.getInstance().on("visible",this.onVisible_,this),e.host.indexOf("fblocal")===-1&&$t.getInstance().on("online",this.onOnline_,this)}sendRequest(e,t,s){const i=++this.requestNumber_,r={r:i,a:e,b:t};this.log_(M(r)),f(this.connected_,"sendRequest call when we're not connected not allowed."),this.realtime_.sendRequest(r),s&&(this.requestCBHash_[i]=s)}get(e){this.initConnection_();const t=new G,i={action:"g",request:{p:e._path.toString(),q:e._queryObject},onComplete:o=>{const a=o.d;o.s==="ok"?t.resolve(a):t.reject(a)}};this.outstandingGets_.push(i),this.outstandingGetCount_++;const r=this.outstandingGets_.length-1;return this.connected_&&this.sendGet_(r),t.promise}listen(e,t,s,i){this.initConnection_();const r=e._queryIdentifier,o=e._path.toString();this.log_("Listen called for "+o+" "+r),this.listens.has(o)||this.listens.set(o,new Map),f(e._queryParams.isDefault()||!e._queryParams.loadsAllData(),"listen() called for non-default but complete query"),f(!this.listens.get(o).has(r),"listen() called twice for same path/queryId.");const a={onComplete:i,hashFn:t,query:e,tag:s};this.listens.get(o).set(r,a),this.connected_&&this.sendListen_(a)}sendGet_(e){const t=this.outstandingGets_[e];this.sendRequest("g",t.request,s=>{delete this.outstandingGets_[e],this.outstandingGetCount_--,this.outstandingGetCount_===0&&(this.outstandingGets_=[]),t.onComplete&&t.onComplete(s)})}sendListen_(e){const t=e.query,s=t._path.toString(),i=t._queryIdentifier;this.log_("Listen on "+s+" for "+i);const r={p:s},o="q";e.tag&&(r.q=t._queryObject,r.t=e.tag),r.h=e.hashFn(),this.sendRequest(o,r,a=>{const l=a.d,c=a.s;ne.warnOnListenWarnings_(l,t),(this.listens.get(s)&&this.listens.get(s).get(i))===e&&(this.log_("listen response",a),c!=="ok"&&this.removeListen_(s,i),e.onComplete&&e.onComplete(c,l))})}static warnOnListenWarnings_(e,t){if(e&&typeof e=="object"&&Q(e,"w")){const s=Ce(e,"w");if(Array.isArray(s)&&~s.indexOf("no_index")){const i='".indexOn": "'+t._queryParams.getIndex().toString()+'"',r=t._path.toString();W(`Using an unspecified index. Your data will be downloaded and filtered on the client. Consider adding ${i} at ${r} to your security rules for better performance.`)}}}refreshAuthToken(e){this.authToken_=e,this.log_("Auth token refreshed"),this.authToken_?this.tryAuth():this.connected_&&this.sendRequest("unauth",{},()=>{}),this.reduceReconnectDelayIfAdminCredential_(e)}reduceReconnectDelayIfAdminCredential_(e){(e&&e.length===40||Go(e))&&(this.log_("Admin auth credential detected.  Reducing max reconnect time."),this.maxReconnectDelay_=li)}refreshAppCheckToken(e){this.appCheckToken_=e,this.log_("App check token refreshed"),this.appCheckToken_?this.tryAppCheck():this.connected_&&this.sendRequest("unappeck",{},()=>{})}tryAuth(){if(this.connected_&&this.authToken_){const e=this.authToken_,t=Vo(e)?"auth":"gauth",s={cred:e};this.authOverride_===null?s.noauth=!0:typeof this.authOverride_=="object"&&(s.authvar=this.authOverride_),this.sendRequest(t,s,i=>{const r=i.s,o=i.d||"error";this.authToken_===e&&(r==="ok"?this.invalidAuthTokenCount_=0:this.onAuthRevoked_(r,o))})}}tryAppCheck(){this.connected_&&this.appCheckToken_&&this.sendRequest("appcheck",{token:this.appCheckToken_},e=>{const t=e.s,s=e.d||"error";t==="ok"?this.invalidAppCheckTokenCount_=0:this.onAppCheckRevoked_(t,s)})}unlisten(e,t){const s=e._path.toString(),i=e._queryIdentifier;this.log_("Unlisten called for "+s+" "+i),f(e._queryParams.isDefault()||!e._queryParams.loadsAllData(),"unlisten() called for non-default but complete query"),this.removeListen_(s,i)&&this.connected_&&this.sendUnlisten_(s,i,e._queryObject,t)}sendUnlisten_(e,t,s,i){this.log_("Unlisten on "+e+" for "+t);const r={p:e},o="n";i&&(r.q=s,r.t=i),this.sendRequest(o,r)}onDisconnectPut(e,t,s){this.initConnection_(),this.connected_?this.sendOnDisconnect_("o",e,t,s):this.onDisconnectRequestQueue_.push({pathString:e,action:"o",data:t,onComplete:s})}onDisconnectMerge(e,t,s){this.initConnection_(),this.connected_?this.sendOnDisconnect_("om",e,t,s):this.onDisconnectRequestQueue_.push({pathString:e,action:"om",data:t,onComplete:s})}onDisconnectCancel(e,t){this.initConnection_(),this.connected_?this.sendOnDisconnect_("oc",e,null,t):this.onDisconnectRequestQueue_.push({pathString:e,action:"oc",data:null,onComplete:t})}sendOnDisconnect_(e,t,s,i){const r={p:t,d:s};this.log_("onDisconnect "+e,r),this.sendRequest(e,r,o=>{i&&setTimeout(()=>{i(o.s,o.d)},Math.floor(0))})}put(e,t,s,i){this.putInternal("p",e,t,s,i)}merge(e,t,s,i){this.putInternal("m",e,t,s,i)}putInternal(e,t,s,i,r){this.initConnection_();const o={p:t,d:s};r!==void 0&&(o.h=r),this.outstandingPuts_.push({action:e,request:o,onComplete:i}),this.outstandingPutCount_++;const a=this.outstandingPuts_.length-1;this.connected_?this.sendPut_(a):this.log_("Buffering put: "+t)}sendPut_(e){const t=this.outstandingPuts_[e].action,s=this.outstandingPuts_[e].request,i=this.outstandingPuts_[e].onComplete;this.outstandingPuts_[e].queued=this.connected_,this.sendRequest(t,s,r=>{this.log_(t+" response",r),delete this.outstandingPuts_[e],this.outstandingPutCount_--,this.outstandingPutCount_===0&&(this.outstandingPuts_=[]),i&&i(r.s,r.d)})}reportStats(e){if(this.connected_){const t={c:e};this.log_("reportStats",t),this.sendRequest("s",t,s=>{if(s.s!=="ok"){const r=s.d;this.log_("reportStats","Error sending stats: "+r)}})}}onDataMessage_(e){if("r"in e){this.log_("from server: "+M(e));const t=e.r,s=this.requestCBHash_[t];s&&(delete this.requestCBHash_[t],s(e.b))}else{if("error"in e)throw"A server-side error has occurred: "+e.error;"a"in e&&this.onDataPush_(e.a,e.b)}}onDataPush_(e,t){this.log_("handleServerMessage",e,t),e==="d"?this.onDataUpdate_(t.p,t.d,!1,t.t):e==="m"?this.onDataUpdate_(t.p,t.d,!0,t.t):e==="c"?this.onListenRevoked_(t.p,t.q):e==="ac"?this.onAuthRevoked_(t.s,t.d):e==="apc"?this.onAppCheckRevoked_(t.s,t.d):e==="sd"?this.onSecurityDebugPacket_(t):Fn("Unrecognized action received from server: "+M(e)+`
Are you using the latest client?`)}onReady_(e,t){this.log_("connection ready"),this.connected_=!0,this.lastConnectionEstablishedTime_=new Date().getTime(),this.handleTimestamp_(e),this.lastSessionId=t,this.firstConnection_&&this.sendConnectStats_(),this.restoreState_(),this.firstConnection_=!1,this.onConnectStatus_(!0)}scheduleConnect_(e){f(!this.realtime_,"Scheduling a connect when we're already connected/ing?"),this.establishConnectionTimer_&&clearTimeout(this.establishConnectionTimer_),this.establishConnectionTimer_=setTimeout(()=>{this.establishConnectionTimer_=null,this.establishConnection_()},Math.floor(e))}initConnection_(){!this.realtime_&&this.firstConnection_&&this.scheduleConnect_(0)}onVisible_(e){e&&!this.visible_&&this.reconnectDelay_===this.maxReconnectDelay_&&(this.log_("Window became visible.  Reducing delay."),this.reconnectDelay_=Xe,this.realtime_||this.scheduleConnect_(0)),this.visible_=e}onOnline_(e){e?(this.log_("Browser went online."),this.reconnectDelay_=Xe,this.realtime_||this.scheduleConnect_(0)):(this.log_("Browser went offline.  Killing connection."),this.realtime_&&this.realtime_.close())}onRealtimeDisconnect_(){if(this.log_("data client disconnected"),this.connected_=!1,this.realtime_=null,this.cancelSentTransactions_(),this.requestCBHash_={},this.shouldReconnect_()){this.visible_?this.lastConnectionEstablishedTime_&&(new Date().getTime()-this.lastConnectionEstablishedTime_>nc&&(this.reconnectDelay_=Xe),this.lastConnectionEstablishedTime_=null):(this.log_("Window isn't visible.  Delaying reconnect."),this.reconnectDelay_=this.maxReconnectDelay_,this.lastConnectionAttemptTime_=new Date().getTime());const e=Math.max(0,new Date().getTime()-this.lastConnectionAttemptTime_);let t=Math.max(0,this.reconnectDelay_-e);t=Math.random()*t,this.log_("Trying to reconnect in "+t+"ms"),this.scheduleConnect_(t),this.reconnectDelay_=Math.min(this.maxReconnectDelay_,this.reconnectDelay_*tc)}this.onConnectStatus_(!1)}async establishConnection_(){if(this.shouldReconnect_()){this.log_("Making a connection attempt"),this.lastConnectionAttemptTime_=new Date().getTime(),this.lastConnectionEstablishedTime_=null;const e=this.onDataMessage_.bind(this),t=this.onReady_.bind(this),s=this.onRealtimeDisconnect_.bind(this),i=this.id+":"+ne.nextConnectionId_++,r=this.lastSessionId;let o=!1,a=null;const l=function(){a?a.close():(o=!0,s())},c=function(u){f(a,"sendRequest call when we're not connected not allowed."),a.sendRequest(u)};this.realtime_={close:l,sendRequest:c};const d=this.forceTokenRefresh_;this.forceTokenRefresh_=!1;try{const[u,h]=await Promise.all([this.authTokenProvider_.getToken(d),this.appCheckTokenProvider_.getToken(d)]);o?F("getToken() completed but was canceled"):(F("getToken() completed. Creating connection."),this.authToken_=u&&u.accessToken,this.appCheckToken_=h&&h.token,a=new Yl(i,this.repoInfo_,this.applicationId_,this.appCheckToken_,this.authToken_,e,t,s,p=>{W(p+" ("+this.repoInfo_.toString()+")"),this.interrupt(sc)},r))}catch(u){this.log_("Failed to get token: "+u),o||(this.repoInfo_.nodeAdmin&&W(u),l())}}}interrupt(e){F("Interrupting connection for reason: "+e),this.interruptReasons_[e]=!0,this.realtime_?this.realtime_.close():(this.establishConnectionTimer_&&(clearTimeout(this.establishConnectionTimer_),this.establishConnectionTimer_=null),this.connected_&&this.onRealtimeDisconnect_())}resume(e){F("Resuming connection for reason: "+e),delete this.interruptReasons_[e],Dn(this.interruptReasons_)&&(this.reconnectDelay_=Xe,this.realtime_||this.scheduleConnect_(0))}handleTimestamp_(e){const t=e-new Date().getTime();this.onServerInfoUpdate_({serverTimeOffset:t})}cancelSentTransactions_(){for(let e=0;e<this.outstandingPuts_.length;e++){const t=this.outstandingPuts_[e];t&&"h"in t.request&&t.queued&&(t.onComplete&&t.onComplete("disconnect"),delete this.outstandingPuts_[e],this.outstandingPutCount_--)}this.outstandingPutCount_===0&&(this.outstandingPuts_=[])}onListenRevoked_(e,t){let s;t?s=t.map(r=>ts(r)).join("$"):s="default";const i=this.removeListen_(e,s);i&&i.onComplete&&i.onComplete("permission_denied")}removeListen_(e,t){const s=new I(e).toString();let i;if(this.listens.has(s)){const r=this.listens.get(s);i=r.get(t),r.delete(t),r.size===0&&this.listens.delete(s)}else i=void 0;return i}onAuthRevoked_(e,t){F("Auth token revoked: "+e+"/"+t),this.authToken_=null,this.forceTokenRefresh_=!0,this.realtime_.close(),(e==="invalid_token"||e==="permission_denied")&&(this.invalidAuthTokenCount_++,this.invalidAuthTokenCount_>=ci&&(this.reconnectDelay_=li,this.authTokenProvider_.notifyForInvalidToken()))}onAppCheckRevoked_(e,t){F("App check token revoked: "+e+"/"+t),this.appCheckToken_=null,this.forceTokenRefresh_=!0,(e==="invalid_token"||e==="permission_denied")&&(this.invalidAppCheckTokenCount_++,this.invalidAppCheckTokenCount_>=ci&&this.appCheckTokenProvider_.notifyForInvalidToken())}onSecurityDebugPacket_(e){this.securityDebugCallback_?this.securityDebugCallback_(e):"msg"in e&&console.log("FIREBASE: "+e.msg.replace(`
`,`
FIREBASE: `))}restoreState_(){this.tryAuth(),this.tryAppCheck();for(const e of this.listens.values())for(const t of e.values())this.sendListen_(t);for(let e=0;e<this.outstandingPuts_.length;e++)this.outstandingPuts_[e]&&this.sendPut_(e);for(;this.onDisconnectRequestQueue_.length;){const e=this.onDisconnectRequestQueue_.shift();this.sendOnDisconnect_(e.action,e.pathString,e.data,e.onComplete)}for(let e=0;e<this.outstandingGets_.length;e++)this.outstandingGets_[e]&&this.sendGet_(e)}sendConnectStats_(){const e={};let t="js";e["sdk."+t+"."+Yi.replace(/\./g,"-")]=1,Bi()?e["framework.cordova"]=1:Fo()&&(e["framework.reactnative"]=1),this.reportStats(e)}shouldReconnect_(){const e=$t.getInstance().currentlyOnline();return Dn(this.interruptReasons_)&&e}}ne.nextPersistentConnectionId_=0;ne.nextConnectionId_=0;/**
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
 */class en{getCompare(){return this.compare.bind(this)}indexedValueChanged(e,t){const s=new b(Be,e),i=new b(Be,t);return this.compare(s,i)!==0}minPost(){return b.MIN}}/**
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
 */let Rt;class br extends en{static get __EMPTY_NODE(){return Rt}static set __EMPTY_NODE(e){Rt=e}compare(e,t){return Te(e.name,t.name)}isDefinedOn(e){throw Ge("KeyIndex.isDefinedOn not expected to be called.")}indexedValueChanged(e,t){return!1}minPost(){return b.MIN}maxPost(){return new b(we,Rt)}makePost(e,t){return f(typeof e=="string","KeyIndex indexValue must always be a string."),new b(e,Rt)}toString(){return".key"}}const Fe=new br;/**
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
 */class Nt{constructor(e,t,s,i,r=null){this.isReverse_=i,this.resultGenerator_=r,this.nodeStack_=[];let o=1;for(;!e.isEmpty();)if(e=e,o=t?s(e.key,t):1,i&&(o*=-1),o<0)this.isReverse_?e=e.left:e=e.right;else if(o===0){this.nodeStack_.push(e);break}else this.nodeStack_.push(e),this.isReverse_?e=e.right:e=e.left}getNext(){if(this.nodeStack_.length===0)return null;let e=this.nodeStack_.pop(),t;if(this.resultGenerator_?t=this.resultGenerator_(e.key,e.value):t={key:e.key,value:e.value},this.isReverse_)for(e=e.left;!e.isEmpty();)this.nodeStack_.push(e),e=e.right;else for(e=e.right;!e.isEmpty();)this.nodeStack_.push(e),e=e.left;return t}hasNext(){return this.nodeStack_.length>0}peek(){if(this.nodeStack_.length===0)return null;const e=this.nodeStack_[this.nodeStack_.length-1];return this.resultGenerator_?this.resultGenerator_(e.key,e.value):{key:e.key,value:e.value}}}class L{constructor(e,t,s,i,r){this.key=e,this.value=t,this.color=s??L.RED,this.left=i??U.EMPTY_NODE,this.right=r??U.EMPTY_NODE}copy(e,t,s,i,r){return new L(e??this.key,t??this.value,s??this.color,i??this.left,r??this.right)}count(){return this.left.count()+1+this.right.count()}isEmpty(){return!1}inorderTraversal(e){return this.left.inorderTraversal(e)||!!e(this.key,this.value)||this.right.inorderTraversal(e)}reverseTraversal(e){return this.right.reverseTraversal(e)||e(this.key,this.value)||this.left.reverseTraversal(e)}min_(){return this.left.isEmpty()?this:this.left.min_()}minKey(){return this.min_().key}maxKey(){return this.right.isEmpty()?this.key:this.right.maxKey()}insert(e,t,s){let i=this;const r=s(e,i.key);return r<0?i=i.copy(null,null,null,i.left.insert(e,t,s),null):r===0?i=i.copy(null,t,null,null,null):i=i.copy(null,null,null,null,i.right.insert(e,t,s)),i.fixUp_()}removeMin_(){if(this.left.isEmpty())return U.EMPTY_NODE;let e=this;return!e.left.isRed_()&&!e.left.left.isRed_()&&(e=e.moveRedLeft_()),e=e.copy(null,null,null,e.left.removeMin_(),null),e.fixUp_()}remove(e,t){let s,i;if(s=this,t(e,s.key)<0)!s.left.isEmpty()&&!s.left.isRed_()&&!s.left.left.isRed_()&&(s=s.moveRedLeft_()),s=s.copy(null,null,null,s.left.remove(e,t),null);else{if(s.left.isRed_()&&(s=s.rotateRight_()),!s.right.isEmpty()&&!s.right.isRed_()&&!s.right.left.isRed_()&&(s=s.moveRedRight_()),t(e,s.key)===0){if(s.right.isEmpty())return U.EMPTY_NODE;i=s.right.min_(),s=s.copy(i.key,i.value,null,null,s.right.removeMin_())}s=s.copy(null,null,null,null,s.right.remove(e,t))}return s.fixUp_()}isRed_(){return this.color}fixUp_(){let e=this;return e.right.isRed_()&&!e.left.isRed_()&&(e=e.rotateLeft_()),e.left.isRed_()&&e.left.left.isRed_()&&(e=e.rotateRight_()),e.left.isRed_()&&e.right.isRed_()&&(e=e.colorFlip_()),e}moveRedLeft_(){let e=this.colorFlip_();return e.right.left.isRed_()&&(e=e.copy(null,null,null,null,e.right.rotateRight_()),e=e.rotateLeft_(),e=e.colorFlip_()),e}moveRedRight_(){let e=this.colorFlip_();return e.left.left.isRed_()&&(e=e.rotateRight_(),e=e.colorFlip_()),e}rotateLeft_(){const e=this.copy(null,null,L.RED,null,this.right.left);return this.right.copy(null,null,this.color,e,null)}rotateRight_(){const e=this.copy(null,null,L.RED,this.left.right,null);return this.left.copy(null,null,this.color,null,e)}colorFlip_(){const e=this.left.copy(null,null,!this.left.color,null,null),t=this.right.copy(null,null,!this.right.color,null,null);return this.copy(null,null,!this.color,e,t)}checkMaxDepth_(){const e=this.check_();return Math.pow(2,e)<=this.count()+1}check_(){if(this.isRed_()&&this.left.isRed_())throw new Error("Red node has red child("+this.key+","+this.value+")");if(this.right.isRed_())throw new Error("Right child of ("+this.key+","+this.value+") is red");const e=this.left.check_();if(e!==this.right.check_())throw new Error("Black depths differ");return e+(this.isRed_()?0:1)}}L.RED=!0;L.BLACK=!1;class ic{copy(e,t,s,i,r){return this}insert(e,t,s){return new L(e,t,null)}remove(e,t){return this}count(){return 0}isEmpty(){return!0}inorderTraversal(e){return!1}reverseTraversal(e){return!1}minKey(){return null}maxKey(){return null}check_(){return 0}isRed_(){return!1}}class U{constructor(e,t=U.EMPTY_NODE){this.comparator_=e,this.root_=t}insert(e,t){return new U(this.comparator_,this.root_.insert(e,t,this.comparator_).copy(null,null,L.BLACK,null,null))}remove(e){return new U(this.comparator_,this.root_.remove(e,this.comparator_).copy(null,null,L.BLACK,null,null))}get(e){let t,s=this.root_;for(;!s.isEmpty();){if(t=this.comparator_(e,s.key),t===0)return s.value;t<0?s=s.left:t>0&&(s=s.right)}return null}getPredecessorKey(e){let t,s=this.root_,i=null;for(;!s.isEmpty();)if(t=this.comparator_(e,s.key),t===0){if(s.left.isEmpty())return i?i.key:null;for(s=s.left;!s.right.isEmpty();)s=s.right;return s.key}else t<0?s=s.left:t>0&&(i=s,s=s.right);throw new Error("Attempted to find predecessor key for a nonexistent key.  What gives?")}isEmpty(){return this.root_.isEmpty()}count(){return this.root_.count()}minKey(){return this.root_.minKey()}maxKey(){return this.root_.maxKey()}inorderTraversal(e){return this.root_.inorderTraversal(e)}reverseTraversal(e){return this.root_.reverseTraversal(e)}getIterator(e){return new Nt(this.root_,null,this.comparator_,!1,e)}getIteratorFrom(e,t){return new Nt(this.root_,e,this.comparator_,!1,t)}getReverseIteratorFrom(e,t){return new Nt(this.root_,e,this.comparator_,!0,t)}getReverseIterator(e){return new Nt(this.root_,null,this.comparator_,!0,e)}}U.EMPTY_NODE=new ic;/**
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
 */function rc(n,e){return Te(n.name,e.name)}function ls(n,e){return Te(n,e)}/**
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
 */let Bn;function oc(n){Bn=n}const Cr=function(n){return typeof n=="number"?"number:"+Zi(n):"string:"+n},wr=function(n){if(n.isLeafNode()){const e=n.val();f(typeof e=="string"||typeof e=="number"||typeof e=="object"&&Q(e,".sv"),"Priority must be a string or number.")}else f(n===Bn||n.isEmpty(),"priority of unexpected type.");f(n===Bn||n.getPriority().isEmpty(),"Priority nodes can't have a priority of their own.")};/**
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
 */let ui;class x{static set __childrenNodeConstructor(e){ui=e}static get __childrenNodeConstructor(){return ui}constructor(e,t=x.__childrenNodeConstructor.EMPTY_NODE){this.value_=e,this.priorityNode_=t,this.lazyHash_=null,f(this.value_!==void 0&&this.value_!==null,"LeafNode shouldn't be created with null/undefined value."),wr(this.priorityNode_)}isLeafNode(){return!0}getPriority(){return this.priorityNode_}updatePriority(e){return new x(this.value_,e)}getImmediateChild(e){return e===".priority"?this.priorityNode_:x.__childrenNodeConstructor.EMPTY_NODE}getChild(e){return v(e)?this:y(e)===".priority"?this.priorityNode_:x.__childrenNodeConstructor.EMPTY_NODE}hasChild(){return!1}getPredecessorChildName(e,t){return null}updateImmediateChild(e,t){return e===".priority"?this.updatePriority(t):t.isEmpty()&&e!==".priority"?this:x.__childrenNodeConstructor.EMPTY_NODE.updateImmediateChild(e,t).updatePriority(this.priorityNode_)}updateChild(e,t){const s=y(e);return s===null?t:t.isEmpty()&&s!==".priority"?this:(f(s!==".priority"||de(e)===1,".priority must be the last token in a path"),this.updateImmediateChild(s,x.__childrenNodeConstructor.EMPTY_NODE.updateChild(S(e),t)))}isEmpty(){return!1}numChildren(){return 0}forEachChild(e,t){return!1}val(e){return e&&!this.getPriority().isEmpty()?{".value":this.getValue(),".priority":this.getPriority().val()}:this.getValue()}hash(){if(this.lazyHash_===null){let e="";this.priorityNode_.isEmpty()||(e+="priority:"+Cr(this.priorityNode_.val())+":");const t=typeof this.value_;e+=t+":",t==="number"?e+=Zi(this.value_):e+=this.value_,this.lazyHash_=Xi(e)}return this.lazyHash_}getValue(){return this.value_}compareTo(e){return e===x.__childrenNodeConstructor.EMPTY_NODE?1:e instanceof x.__childrenNodeConstructor?-1:(f(e.isLeafNode(),"Unknown node type"),this.compareToLeafNode_(e))}compareToLeafNode_(e){const t=typeof e.value_,s=typeof this.value_,i=x.VALUE_TYPE_ORDER.indexOf(t),r=x.VALUE_TYPE_ORDER.indexOf(s);return f(i>=0,"Unknown leaf type: "+t),f(r>=0,"Unknown leaf type: "+s),i===r?s==="object"?0:this.value_<e.value_?-1:this.value_===e.value_?0:1:r-i}withIndex(){return this}isIndexed(){return!0}equals(e){if(e===this)return!0;if(e.isLeafNode()){const t=e;return this.value_===t.value_&&this.priorityNode_.equals(t.priorityNode_)}else return!1}}x.VALUE_TYPE_ORDER=["object","boolean","number","string"];/**
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
 */let Er,Ir;function ac(n){Er=n}function lc(n){Ir=n}class cc extends en{compare(e,t){const s=e.node.getPriority(),i=t.node.getPriority(),r=s.compareTo(i);return r===0?Te(e.name,t.name):r}isDefinedOn(e){return!e.getPriority().isEmpty()}indexedValueChanged(e,t){return!e.getPriority().equals(t.getPriority())}minPost(){return b.MIN}maxPost(){return new b(we,new x("[PRIORITY-POST]",Ir))}makePost(e,t){const s=Er(e);return new b(t,new x("[PRIORITY-POST]",s))}toString(){return".priority"}}const A=new cc;/**
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
 */const uc=Math.log(2);class hc{constructor(e){const t=r=>parseInt(Math.log(r)/uc,10),s=r=>parseInt(Array(r+1).join("1"),2);this.count=t(e+1),this.current_=this.count-1;const i=s(this.count);this.bits_=e+1&i}nextBitIsOne(){const e=!(this.bits_&1<<this.current_);return this.current_--,e}}const Bt=function(n,e,t,s){n.sort(e);const i=function(l,c){const d=c-l;let u,h;if(d===0)return null;if(d===1)return u=n[l],h=t?t(u):u,new L(h,u.node,L.BLACK,null,null);{const p=parseInt(d/2,10)+l,_=i(l,p),w=i(p+1,c);return u=n[p],h=t?t(u):u,new L(h,u.node,L.BLACK,_,w)}},r=function(l){let c=null,d=null,u=n.length;const h=function(_,w){const O=u-_,J=u;u-=_;const Z=i(O+1,J),ge=n[O],mn=t?t(ge):ge;p(new L(mn,ge.node,w,null,Z))},p=function(_){c?(c.left=_,c=_):(d=_,c=_)};for(let _=0;_<l.count;++_){const w=l.nextBitIsOne(),O=Math.pow(2,l.count-(_+1));w?h(O,L.BLACK):(h(O,L.BLACK),h(O,L.RED))}return d},o=new hc(n.length),a=r(o);return new U(s||e,a)};/**
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
 */let In;const De={};class te{static get Default(){return f(De&&A,"ChildrenNode.ts has not been loaded"),In=In||new te({".priority":De},{".priority":A}),In}constructor(e,t){this.indexes_=e,this.indexSet_=t}get(e){const t=Ce(this.indexes_,e);if(!t)throw new Error("No index defined for "+e);return t instanceof U?t:null}hasIndex(e){return Q(this.indexSet_,e.toString())}addIndex(e,t){f(e!==Fe,"KeyIndex always exists and isn't meant to be added to the IndexMap.");const s=[];let i=!1;const r=t.getIterator(b.Wrap);let o=r.getNext();for(;o;)i=i||e.isDefinedOn(o.node),s.push(o),o=r.getNext();let a;i?a=Bt(s,e.getCompare()):a=De;const l=e.toString(),c=Object.assign({},this.indexSet_);c[l]=e;const d=Object.assign({},this.indexes_);return d[l]=a,new te(d,c)}addToIndexes(e,t){const s=Ot(this.indexes_,(i,r)=>{const o=Ce(this.indexSet_,r);if(f(o,"Missing index implementation for "+r),i===De)if(o.isDefinedOn(e.node)){const a=[],l=t.getIterator(b.Wrap);let c=l.getNext();for(;c;)c.name!==e.name&&a.push(c),c=l.getNext();return a.push(e),Bt(a,o.getCompare())}else return De;else{const a=t.get(e.name);let l=i;return a&&(l=l.remove(new b(e.name,a))),l.insert(e,e.node)}});return new te(s,this.indexSet_)}removeFromIndexes(e,t){const s=Ot(this.indexes_,i=>{if(i===De)return i;{const r=t.get(e.name);return r?i.remove(new b(e.name,r)):i}});return new te(s,this.indexSet_)}}/**
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
 */let Je;class m{static get EMPTY_NODE(){return Je||(Je=new m(new U(ls),null,te.Default))}constructor(e,t,s){this.children_=e,this.priorityNode_=t,this.indexMap_=s,this.lazyHash_=null,this.priorityNode_&&wr(this.priorityNode_),this.children_.isEmpty()&&f(!this.priorityNode_||this.priorityNode_.isEmpty(),"An empty node cannot have a priority")}isLeafNode(){return!1}getPriority(){return this.priorityNode_||Je}updatePriority(e){return this.children_.isEmpty()?this:new m(this.children_,e,this.indexMap_)}getImmediateChild(e){if(e===".priority")return this.getPriority();{const t=this.children_.get(e);return t===null?Je:t}}getChild(e){const t=y(e);return t===null?this:this.getImmediateChild(t).getChild(S(e))}hasChild(e){return this.children_.get(e)!==null}updateImmediateChild(e,t){if(f(t,"We should always be passing snapshot nodes"),e===".priority")return this.updatePriority(t);{const s=new b(e,t);let i,r;t.isEmpty()?(i=this.children_.remove(e),r=this.indexMap_.removeFromIndexes(s,this.children_)):(i=this.children_.insert(e,t),r=this.indexMap_.addToIndexes(s,this.children_));const o=i.isEmpty()?Je:this.priorityNode_;return new m(i,o,r)}}updateChild(e,t){const s=y(e);if(s===null)return t;{f(y(e)!==".priority"||de(e)===1,".priority must be the last token in a path");const i=this.getImmediateChild(s).updateChild(S(e),t);return this.updateImmediateChild(s,i)}}isEmpty(){return this.children_.isEmpty()}numChildren(){return this.children_.count()}val(e){if(this.isEmpty())return null;const t={};let s=0,i=0,r=!0;if(this.forEachChild(A,(o,a)=>{t[o]=a.val(e),s++,r&&m.INTEGER_REGEXP_.test(o)?i=Math.max(i,Number(o)):r=!1}),!e&&r&&i<2*s){const o=[];for(const a in t)o[a]=t[a];return o}else return e&&!this.getPriority().isEmpty()&&(t[".priority"]=this.getPriority().val()),t}hash(){if(this.lazyHash_===null){let e="";this.getPriority().isEmpty()||(e+="priority:"+Cr(this.getPriority().val())+":"),this.forEachChild(A,(t,s)=>{const i=s.hash();i!==""&&(e+=":"+t+":"+i)}),this.lazyHash_=e===""?"":Xi(e)}return this.lazyHash_}getPredecessorChildName(e,t,s){const i=this.resolveIndex_(s);if(i){const r=i.getPredecessorKey(new b(e,t));return r?r.name:null}else return this.children_.getPredecessorKey(e)}getFirstChildName(e){const t=this.resolveIndex_(e);if(t){const s=t.minKey();return s&&s.name}else return this.children_.minKey()}getFirstChild(e){const t=this.getFirstChildName(e);return t?new b(t,this.children_.get(t)):null}getLastChildName(e){const t=this.resolveIndex_(e);if(t){const s=t.maxKey();return s&&s.name}else return this.children_.maxKey()}getLastChild(e){const t=this.getLastChildName(e);return t?new b(t,this.children_.get(t)):null}forEachChild(e,t){const s=this.resolveIndex_(e);return s?s.inorderTraversal(i=>t(i.name,i.node)):this.children_.inorderTraversal(t)}getIterator(e){return this.getIteratorFrom(e.minPost(),e)}getIteratorFrom(e,t){const s=this.resolveIndex_(t);if(s)return s.getIteratorFrom(e,i=>i);{const i=this.children_.getIteratorFrom(e.name,b.Wrap);let r=i.peek();for(;r!=null&&t.compare(r,e)<0;)i.getNext(),r=i.peek();return i}}getReverseIterator(e){return this.getReverseIteratorFrom(e.maxPost(),e)}getReverseIteratorFrom(e,t){const s=this.resolveIndex_(t);if(s)return s.getReverseIteratorFrom(e,i=>i);{const i=this.children_.getReverseIteratorFrom(e.name,b.Wrap);let r=i.peek();for(;r!=null&&t.compare(r,e)>0;)i.getNext(),r=i.peek();return i}}compareTo(e){return this.isEmpty()?e.isEmpty()?0:-1:e.isLeafNode()||e.isEmpty()?1:e===wt?-1:0}withIndex(e){if(e===Fe||this.indexMap_.hasIndex(e))return this;{const t=this.indexMap_.addIndex(e,this.children_);return new m(this.children_,this.priorityNode_,t)}}isIndexed(e){return e===Fe||this.indexMap_.hasIndex(e)}equals(e){if(e===this)return!0;if(e.isLeafNode())return!1;{const t=e;if(this.getPriority().equals(t.getPriority()))if(this.children_.count()===t.children_.count()){const s=this.getIterator(A),i=t.getIterator(A);let r=s.getNext(),o=i.getNext();for(;r&&o;){if(r.name!==o.name||!r.node.equals(o.node))return!1;r=s.getNext(),o=i.getNext()}return r===null&&o===null}else return!1;else return!1}}resolveIndex_(e){return e===Fe?null:this.indexMap_.get(e.toString())}}m.INTEGER_REGEXP_=/^(0|[1-9]\d*)$/;class dc extends m{constructor(){super(new U(ls),m.EMPTY_NODE,te.Default)}compareTo(e){return e===this?0:1}equals(e){return e===this}getPriority(){return this}getImmediateChild(e){return m.EMPTY_NODE}isEmpty(){return!1}}const wt=new dc;Object.defineProperties(b,{MIN:{value:new b(Be,m.EMPTY_NODE)},MAX:{value:new b(we,wt)}});br.__EMPTY_NODE=m.EMPTY_NODE;x.__childrenNodeConstructor=m;oc(wt);lc(wt);/**
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
 */const fc=!0;function D(n,e=null){if(n===null)return m.EMPTY_NODE;if(typeof n=="object"&&".priority"in n&&(e=n[".priority"]),f(e===null||typeof e=="string"||typeof e=="number"||typeof e=="object"&&".sv"in e,"Invalid priority type found: "+typeof e),typeof n=="object"&&".value"in n&&n[".value"]!==null&&(n=n[".value"]),typeof n!="object"||".sv"in n){const t=n;return new x(t,D(e))}if(!(n instanceof Array)&&fc){const t=[];let s=!1;if($(n,(o,a)=>{if(o.substring(0,1)!=="."){const l=D(a);l.isEmpty()||(s=s||!l.getPriority().isEmpty(),t.push(new b(o,l)))}}),t.length===0)return m.EMPTY_NODE;const r=Bt(t,rc,o=>o.name,ls);if(s){const o=Bt(t,A.getCompare());return new m(r,D(e),new te({".priority":o},{".priority":A}))}else return new m(r,D(e),te.Default)}else{let t=m.EMPTY_NODE;return $(n,(s,i)=>{if(Q(n,s)&&s.substring(0,1)!=="."){const r=D(i);(r.isLeafNode()||!r.isEmpty())&&(t=t.updateImmediateChild(s,r))}}),t.updatePriority(D(e))}}ac(D);/**
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
 */class pc extends en{constructor(e){super(),this.indexPath_=e,f(!v(e)&&y(e)!==".priority","Can't create PathIndex with empty path or .priority key")}extractChild(e){return e.getChild(this.indexPath_)}isDefinedOn(e){return!e.getChild(this.indexPath_).isEmpty()}compare(e,t){const s=this.extractChild(e.node),i=this.extractChild(t.node),r=s.compareTo(i);return r===0?Te(e.name,t.name):r}makePost(e,t){const s=D(e),i=m.EMPTY_NODE.updateChild(this.indexPath_,s);return new b(t,i)}maxPost(){const e=m.EMPTY_NODE.updateChild(this.indexPath_,wt);return new b(we,e)}toString(){return dt(this.indexPath_,0).join("/")}}/**
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
 */class _c extends en{compare(e,t){const s=e.node.compareTo(t.node);return s===0?Te(e.name,t.name):s}isDefinedOn(e){return!0}indexedValueChanged(e,t){return!e.equals(t)}minPost(){return b.MIN}maxPost(){return b.MAX}makePost(e,t){const s=D(e);return new b(t,s)}toString(){return".value"}}const mc=new _c;/**
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
 */function Sr(n){return{type:"value",snapshotNode:n}}function We(n,e){return{type:"child_added",snapshotNode:e,childName:n}}function ft(n,e){return{type:"child_removed",snapshotNode:e,childName:n}}function pt(n,e,t){return{type:"child_changed",snapshotNode:e,childName:n,oldSnap:t}}function gc(n,e){return{type:"child_moved",snapshotNode:e,childName:n}}/**
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
 */class cs{constructor(e){this.index_=e}updateChild(e,t,s,i,r,o){f(e.isIndexed(this.index_),"A node must be indexed if only a child is updated");const a=e.getImmediateChild(t);return a.getChild(i).equals(s.getChild(i))&&a.isEmpty()===s.isEmpty()||(o!=null&&(s.isEmpty()?e.hasChild(t)?o.trackChildChange(ft(t,a)):f(e.isLeafNode(),"A child remove without an old child only makes sense on a leaf node"):a.isEmpty()?o.trackChildChange(We(t,s)):o.trackChildChange(pt(t,s,a))),e.isLeafNode()&&s.isEmpty())?e:e.updateImmediateChild(t,s).withIndex(this.index_)}updateFullNode(e,t,s){return s!=null&&(e.isLeafNode()||e.forEachChild(A,(i,r)=>{t.hasChild(i)||s.trackChildChange(ft(i,r))}),t.isLeafNode()||t.forEachChild(A,(i,r)=>{if(e.hasChild(i)){const o=e.getImmediateChild(i);o.equals(r)||s.trackChildChange(pt(i,r,o))}else s.trackChildChange(We(i,r))})),t.withIndex(this.index_)}updatePriority(e,t){return e.isEmpty()?m.EMPTY_NODE:e.updatePriority(t)}filtersNodes(){return!1}getIndexedFilter(){return this}getIndex(){return this.index_}}/**
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
 */class _t{constructor(e){this.indexedFilter_=new cs(e.getIndex()),this.index_=e.getIndex(),this.startPost_=_t.getStartPost_(e),this.endPost_=_t.getEndPost_(e),this.startIsInclusive_=!e.startAfterSet_,this.endIsInclusive_=!e.endBeforeSet_}getStartPost(){return this.startPost_}getEndPost(){return this.endPost_}matches(e){const t=this.startIsInclusive_?this.index_.compare(this.getStartPost(),e)<=0:this.index_.compare(this.getStartPost(),e)<0,s=this.endIsInclusive_?this.index_.compare(e,this.getEndPost())<=0:this.index_.compare(e,this.getEndPost())<0;return t&&s}updateChild(e,t,s,i,r,o){return this.matches(new b(t,s))||(s=m.EMPTY_NODE),this.indexedFilter_.updateChild(e,t,s,i,r,o)}updateFullNode(e,t,s){t.isLeafNode()&&(t=m.EMPTY_NODE);let i=t.withIndex(this.index_);i=i.updatePriority(m.EMPTY_NODE);const r=this;return t.forEachChild(A,(o,a)=>{r.matches(new b(o,a))||(i=i.updateImmediateChild(o,m.EMPTY_NODE))}),this.indexedFilter_.updateFullNode(e,i,s)}updatePriority(e,t){return e}filtersNodes(){return!0}getIndexedFilter(){return this.indexedFilter_}getIndex(){return this.index_}static getStartPost_(e){if(e.hasStart()){const t=e.getIndexStartName();return e.getIndex().makePost(e.getIndexStartValue(),t)}else return e.getIndex().minPost()}static getEndPost_(e){if(e.hasEnd()){const t=e.getIndexEndName();return e.getIndex().makePost(e.getIndexEndValue(),t)}else return e.getIndex().maxPost()}}/**
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
 */class yc{constructor(e){this.withinDirectionalStart=t=>this.reverse_?this.withinEndPost(t):this.withinStartPost(t),this.withinDirectionalEnd=t=>this.reverse_?this.withinStartPost(t):this.withinEndPost(t),this.withinStartPost=t=>{const s=this.index_.compare(this.rangedFilter_.getStartPost(),t);return this.startIsInclusive_?s<=0:s<0},this.withinEndPost=t=>{const s=this.index_.compare(t,this.rangedFilter_.getEndPost());return this.endIsInclusive_?s<=0:s<0},this.rangedFilter_=new _t(e),this.index_=e.getIndex(),this.limit_=e.getLimit(),this.reverse_=!e.isViewFromLeft(),this.startIsInclusive_=!e.startAfterSet_,this.endIsInclusive_=!e.endBeforeSet_}updateChild(e,t,s,i,r,o){return this.rangedFilter_.matches(new b(t,s))||(s=m.EMPTY_NODE),e.getImmediateChild(t).equals(s)?e:e.numChildren()<this.limit_?this.rangedFilter_.getIndexedFilter().updateChild(e,t,s,i,r,o):this.fullLimitUpdateChild_(e,t,s,r,o)}updateFullNode(e,t,s){let i;if(t.isLeafNode()||t.isEmpty())i=m.EMPTY_NODE.withIndex(this.index_);else if(this.limit_*2<t.numChildren()&&t.isIndexed(this.index_)){i=m.EMPTY_NODE.withIndex(this.index_);let r;this.reverse_?r=t.getReverseIteratorFrom(this.rangedFilter_.getEndPost(),this.index_):r=t.getIteratorFrom(this.rangedFilter_.getStartPost(),this.index_);let o=0;for(;r.hasNext()&&o<this.limit_;){const a=r.getNext();if(this.withinDirectionalStart(a))if(this.withinDirectionalEnd(a))i=i.updateImmediateChild(a.name,a.node),o++;else break;else continue}}else{i=t.withIndex(this.index_),i=i.updatePriority(m.EMPTY_NODE);let r;this.reverse_?r=i.getReverseIterator(this.index_):r=i.getIterator(this.index_);let o=0;for(;r.hasNext();){const a=r.getNext();o<this.limit_&&this.withinDirectionalStart(a)&&this.withinDirectionalEnd(a)?o++:i=i.updateImmediateChild(a.name,m.EMPTY_NODE)}}return this.rangedFilter_.getIndexedFilter().updateFullNode(e,i,s)}updatePriority(e,t){return e}filtersNodes(){return!0}getIndexedFilter(){return this.rangedFilter_.getIndexedFilter()}getIndex(){return this.index_}fullLimitUpdateChild_(e,t,s,i,r){let o;if(this.reverse_){const u=this.index_.getCompare();o=(h,p)=>u(p,h)}else o=this.index_.getCompare();const a=e;f(a.numChildren()===this.limit_,"");const l=new b(t,s),c=this.reverse_?a.getFirstChild(this.index_):a.getLastChild(this.index_),d=this.rangedFilter_.matches(l);if(a.hasChild(t)){const u=a.getImmediateChild(t);let h=i.getChildAfterChild(this.index_,c,this.reverse_);for(;h!=null&&(h.name===t||a.hasChild(h.name));)h=i.getChildAfterChild(this.index_,h,this.reverse_);const p=h==null?1:o(h,l);if(d&&!s.isEmpty()&&p>=0)return r!=null&&r.trackChildChange(pt(t,s,u)),a.updateImmediateChild(t,s);{r!=null&&r.trackChildChange(ft(t,u));const w=a.updateImmediateChild(t,m.EMPTY_NODE);return h!=null&&this.rangedFilter_.matches(h)?(r!=null&&r.trackChildChange(We(h.name,h.node)),w.updateImmediateChild(h.name,h.node)):w}}else return s.isEmpty()?e:d&&o(c,l)>=0?(r!=null&&(r.trackChildChange(ft(c.name,c.node)),r.trackChildChange(We(t,s))),a.updateImmediateChild(t,s).updateImmediateChild(c.name,m.EMPTY_NODE)):e}}/**
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
 */class us{constructor(){this.limitSet_=!1,this.startSet_=!1,this.startNameSet_=!1,this.startAfterSet_=!1,this.endSet_=!1,this.endNameSet_=!1,this.endBeforeSet_=!1,this.limit_=0,this.viewFrom_="",this.indexStartValue_=null,this.indexStartName_="",this.indexEndValue_=null,this.indexEndName_="",this.index_=A}hasStart(){return this.startSet_}isViewFromLeft(){return this.viewFrom_===""?this.startSet_:this.viewFrom_==="l"}getIndexStartValue(){return f(this.startSet_,"Only valid if start has been set"),this.indexStartValue_}getIndexStartName(){return f(this.startSet_,"Only valid if start has been set"),this.startNameSet_?this.indexStartName_:Be}hasEnd(){return this.endSet_}getIndexEndValue(){return f(this.endSet_,"Only valid if end has been set"),this.indexEndValue_}getIndexEndName(){return f(this.endSet_,"Only valid if end has been set"),this.endNameSet_?this.indexEndName_:we}hasLimit(){return this.limitSet_}hasAnchoredLimit(){return this.limitSet_&&this.viewFrom_!==""}getLimit(){return f(this.limitSet_,"Only valid if limit has been set"),this.limit_}getIndex(){return this.index_}loadsAllData(){return!(this.startSet_||this.endSet_||this.limitSet_)}isDefault(){return this.loadsAllData()&&this.index_===A}copy(){const e=new us;return e.limitSet_=this.limitSet_,e.limit_=this.limit_,e.startSet_=this.startSet_,e.startAfterSet_=this.startAfterSet_,e.indexStartValue_=this.indexStartValue_,e.startNameSet_=this.startNameSet_,e.indexStartName_=this.indexStartName_,e.endSet_=this.endSet_,e.endBeforeSet_=this.endBeforeSet_,e.indexEndValue_=this.indexEndValue_,e.endNameSet_=this.endNameSet_,e.indexEndName_=this.indexEndName_,e.index_=this.index_,e.viewFrom_=this.viewFrom_,e}}function vc(n){return n.loadsAllData()?new cs(n.getIndex()):n.hasLimit()?new yc(n):new _t(n)}function hi(n){const e={};if(n.isDefault())return e;let t;if(n.index_===A?t="$priority":n.index_===mc?t="$value":n.index_===Fe?t="$key":(f(n.index_ instanceof pc,"Unrecognized index type!"),t=n.index_.toString()),e.orderBy=M(t),n.startSet_){const s=n.startAfterSet_?"startAfter":"startAt";e[s]=M(n.indexStartValue_),n.startNameSet_&&(e[s]+=","+M(n.indexStartName_))}if(n.endSet_){const s=n.endBeforeSet_?"endBefore":"endAt";e[s]=M(n.indexEndValue_),n.endNameSet_&&(e[s]+=","+M(n.indexEndName_))}return n.limitSet_&&(n.isViewFromLeft()?e.limitToFirst=n.limit_:e.limitToLast=n.limit_),e}function di(n){const e={};if(n.startSet_&&(e.sp=n.indexStartValue_,n.startNameSet_&&(e.sn=n.indexStartName_),e.sin=!n.startAfterSet_),n.endSet_&&(e.ep=n.indexEndValue_,n.endNameSet_&&(e.en=n.indexEndName_),e.ein=!n.endBeforeSet_),n.limitSet_){e.l=n.limit_;let t=n.viewFrom_;t===""&&(n.isViewFromLeft()?t="l":t="r"),e.vf=t}return n.index_!==A&&(e.i=n.index_.toString()),e}/**
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
 */class Wt extends mr{reportStats(e){throw new Error("Method not implemented.")}static getListenId_(e,t){return t!==void 0?"tag$"+t:(f(e._queryParams.isDefault(),"should have a tag if it's not a default query."),e._path.toString())}constructor(e,t,s,i){super(),this.repoInfo_=e,this.onDataUpdate_=t,this.authTokenProvider_=s,this.appCheckTokenProvider_=i,this.log_=Ct("p:rest:"),this.listens_={}}listen(e,t,s,i){const r=e._path.toString();this.log_("Listen called for "+r+" "+e._queryIdentifier);const o=Wt.getListenId_(e,s),a={};this.listens_[o]=a;const l=hi(e._queryParams);this.restRequest_(r+".json",l,(c,d)=>{let u=d;if(c===404&&(u=null,c=null),c===null&&this.onDataUpdate_(r,u,!1,s),Ce(this.listens_,o)===a){let h;c?c===401?h="permission_denied":h="rest_error:"+c:h="ok",i(h,null)}})}unlisten(e,t){const s=Wt.getListenId_(e,t);delete this.listens_[s]}get(e){const t=hi(e._queryParams),s=e._path.toString(),i=new G;return this.restRequest_(s+".json",t,(r,o)=>{let a=o;r===404&&(a=null,r=null),r===null?(this.onDataUpdate_(s,a,!1,null),i.resolve(a)):i.reject(new Error(a))}),i.promise}refreshAuthToken(e){}restRequest_(e,t={},s){return t.format="export",Promise.all([this.authTokenProvider_.getToken(!1),this.appCheckTokenProvider_.getToken(!1)]).then(([i,r])=>{i&&i.accessToken&&(t.auth=i.accessToken),r&&r.token&&(t.ac=r.token);const o=(this.repoInfo_.secure?"https://":"http://")+this.repoInfo_.host+e+"?ns="+this.repoInfo_.namespace+qo(t);this.log_("Sending REST request for "+o);const a=new XMLHttpRequest;a.onreadystatechange=()=>{if(s&&a.readyState===4){this.log_("REST Response for "+o+" received. status:",a.status,"response:",a.responseText);let l=null;if(a.status>=200&&a.status<300){try{l=lt(a.responseText)}catch{W("Failed to parse JSON response for "+o+": "+a.responseText)}s(null,l)}else a.status!==401&&a.status!==404&&W("Got unsuccessful REST response for "+o+" Status: "+a.status),s(a.status);s=null}},a.open("GET",o,!0),a.send()})}}/**
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
 */class bc{constructor(){this.rootNode_=m.EMPTY_NODE}getNode(e){return this.rootNode_.getChild(e)}updateSnapshot(e,t){this.rootNode_=this.rootNode_.updateChild(e,t)}}/**
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
 */function Ut(){return{value:null,children:new Map}}function ze(n,e,t){if(v(e))n.value=t,n.children.clear();else if(n.value!==null)n.value=n.value.updateChild(e,t);else{const s=y(e);n.children.has(s)||n.children.set(s,Ut());const i=n.children.get(s);e=S(e),ze(i,e,t)}}function Wn(n,e){if(v(e))return n.value=null,n.children.clear(),!0;if(n.value!==null){if(n.value.isLeafNode())return!1;{const t=n.value;return n.value=null,t.forEachChild(A,(s,i)=>{ze(n,new I(s),i)}),Wn(n,e)}}else if(n.children.size>0){const t=y(e);return e=S(e),n.children.has(t)&&Wn(n.children.get(t),e)&&n.children.delete(t),n.children.size===0}else return!0}function Un(n,e,t){n.value!==null?t(e,n.value):Cc(n,(s,i)=>{const r=new I(e.toString()+"/"+s);Un(i,r,t)})}function Cc(n,e){n.children.forEach((t,s)=>{e(s,t)})}/**
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
 */class wc{constructor(e){this.collection_=e,this.last_=null}get(){const e=this.collection_.get(),t=Object.assign({},e);return this.last_&&$(this.last_,(s,i)=>{t[s]=t[s]-i}),this.last_=e,t}}/**
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
 */const fi=10*1e3,Ec=30*1e3,Ic=300*1e3;class Sc{constructor(e,t){this.server_=t,this.statsToReport_={},this.statsListener_=new wc(e);const s=fi+(Ec-fi)*Math.random();st(this.reportStats_.bind(this),Math.floor(s))}reportStats_(){const e=this.statsListener_.get(),t={};let s=!1;$(e,(i,r)=>{r>0&&Q(this.statsToReport_,i)&&(t[i]=r,s=!0)}),s&&this.server_.reportStats(t),st(this.reportStats_.bind(this),Math.floor(Math.random()*2*Ic))}}/**
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
 */var z;(function(n){n[n.OVERWRITE=0]="OVERWRITE",n[n.MERGE=1]="MERGE",n[n.ACK_USER_WRITE=2]="ACK_USER_WRITE",n[n.LISTEN_COMPLETE=3]="LISTEN_COMPLETE"})(z||(z={}));function hs(){return{fromUser:!0,fromServer:!1,queryId:null,tagged:!1}}function ds(){return{fromUser:!1,fromServer:!0,queryId:null,tagged:!1}}function fs(n){return{fromUser:!1,fromServer:!0,queryId:n,tagged:!0}}/**
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
 */class Ht{constructor(e,t,s){this.path=e,this.affectedTree=t,this.revert=s,this.type=z.ACK_USER_WRITE,this.source=hs()}operationForChild(e){if(v(this.path)){if(this.affectedTree.value!=null)return f(this.affectedTree.children.isEmpty(),"affectedTree should not have overlapping affected paths."),this;{const t=this.affectedTree.subtree(new I(e));return new Ht(E(),t,this.revert)}}else return f(y(this.path)===e,"operationForChild called for unrelated child."),new Ht(S(this.path),this.affectedTree,this.revert)}}/**
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
 */class mt{constructor(e,t){this.source=e,this.path=t,this.type=z.LISTEN_COMPLETE}operationForChild(e){return v(this.path)?new mt(this.source,E()):new mt(this.source,S(this.path))}}/**
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
 */class Ee{constructor(e,t,s){this.source=e,this.path=t,this.snap=s,this.type=z.OVERWRITE}operationForChild(e){return v(this.path)?new Ee(this.source,E(),this.snap.getImmediateChild(e)):new Ee(this.source,S(this.path),this.snap)}}/**
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
 */class Ue{constructor(e,t,s){this.source=e,this.path=t,this.children=s,this.type=z.MERGE}operationForChild(e){if(v(this.path)){const t=this.children.subtree(new I(e));return t.isEmpty()?null:t.value?new Ee(this.source,E(),t.value):new Ue(this.source,E(),t)}else return f(y(this.path)===e,"Can't get a merge for a child not on the path of the operation"),new Ue(this.source,S(this.path),this.children)}toString(){return"Operation("+this.path+": "+this.source.toString()+" merge: "+this.children.toString()+")"}}/**
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
 */class fe{constructor(e,t,s){this.node_=e,this.fullyInitialized_=t,this.filtered_=s}isFullyInitialized(){return this.fullyInitialized_}isFiltered(){return this.filtered_}isCompleteForPath(e){if(v(e))return this.isFullyInitialized()&&!this.filtered_;const t=y(e);return this.isCompleteForChild(t)}isCompleteForChild(e){return this.isFullyInitialized()&&!this.filtered_||this.node_.hasChild(e)}getNode(){return this.node_}}/**
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
 */class Tc{constructor(e){this.query_=e,this.index_=this.query_._queryParams.getIndex()}}function Rc(n,e,t,s){const i=[],r=[];return e.forEach(o=>{o.type==="child_changed"&&n.index_.indexedValueChanged(o.oldSnap,o.snapshotNode)&&r.push(gc(o.childName,o.snapshotNode))}),Ze(n,i,"child_removed",e,s,t),Ze(n,i,"child_added",e,s,t),Ze(n,i,"child_moved",r,s,t),Ze(n,i,"child_changed",e,s,t),Ze(n,i,"value",e,s,t),i}function Ze(n,e,t,s,i,r){const o=s.filter(a=>a.type===t);o.sort((a,l)=>kc(n,a,l)),o.forEach(a=>{const l=Nc(n,a,r);i.forEach(c=>{c.respondsTo(a.type)&&e.push(c.createEvent(l,n.query_))})})}function Nc(n,e,t){return e.type==="value"||e.type==="child_removed"||(e.prevName=t.getPredecessorChildName(e.childName,e.snapshotNode,n.index_)),e}function kc(n,e,t){if(e.childName==null||t.childName==null)throw Ge("Should only compare child_ events.");const s=new b(e.childName,e.snapshotNode),i=new b(t.childName,t.snapshotNode);return n.index_.compare(s,i)}/**
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
 */function tn(n,e){return{eventCache:n,serverCache:e}}function it(n,e,t,s){return tn(new fe(e,t,s),n.serverCache)}function Tr(n,e,t,s){return tn(n.eventCache,new fe(e,t,s))}function jt(n){return n.eventCache.isFullyInitialized()?n.eventCache.getNode():null}function Ie(n){return n.serverCache.isFullyInitialized()?n.serverCache.getNode():null}/**
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
 */let Sn;const Ac=()=>(Sn||(Sn=new U(pl)),Sn);class N{static fromObject(e){let t=new N(null);return $(e,(s,i)=>{t=t.set(new I(s),i)}),t}constructor(e,t=Ac()){this.value=e,this.children=t}isEmpty(){return this.value===null&&this.children.isEmpty()}findRootMostMatchingPathAndValue(e,t){if(this.value!=null&&t(this.value))return{path:E(),value:this.value};if(v(e))return null;{const s=y(e),i=this.children.get(s);if(i!==null){const r=i.findRootMostMatchingPathAndValue(S(e),t);return r!=null?{path:P(new I(s),r.path),value:r.value}:null}else return null}}findRootMostValueAndPath(e){return this.findRootMostMatchingPathAndValue(e,()=>!0)}subtree(e){if(v(e))return this;{const t=y(e),s=this.children.get(t);return s!==null?s.subtree(S(e)):new N(null)}}set(e,t){if(v(e))return new N(t,this.children);{const s=y(e),r=(this.children.get(s)||new N(null)).set(S(e),t),o=this.children.insert(s,r);return new N(this.value,o)}}remove(e){if(v(e))return this.children.isEmpty()?new N(null):new N(null,this.children);{const t=y(e),s=this.children.get(t);if(s){const i=s.remove(S(e));let r;return i.isEmpty()?r=this.children.remove(t):r=this.children.insert(t,i),this.value===null&&r.isEmpty()?new N(null):new N(this.value,r)}else return this}}get(e){if(v(e))return this.value;{const t=y(e),s=this.children.get(t);return s?s.get(S(e)):null}}setTree(e,t){if(v(e))return t;{const s=y(e),r=(this.children.get(s)||new N(null)).setTree(S(e),t);let o;return r.isEmpty()?o=this.children.remove(s):o=this.children.insert(s,r),new N(this.value,o)}}fold(e){return this.fold_(E(),e)}fold_(e,t){const s={};return this.children.inorderTraversal((i,r)=>{s[i]=r.fold_(P(e,i),t)}),t(e,this.value,s)}findOnPath(e,t){return this.findOnPath_(e,E(),t)}findOnPath_(e,t,s){const i=this.value?s(t,this.value):!1;if(i)return i;if(v(e))return null;{const r=y(e),o=this.children.get(r);return o?o.findOnPath_(S(e),P(t,r),s):null}}foreachOnPath(e,t){return this.foreachOnPath_(e,E(),t)}foreachOnPath_(e,t,s){if(v(e))return this;{this.value&&s(t,this.value);const i=y(e),r=this.children.get(i);return r?r.foreachOnPath_(S(e),P(t,i),s):new N(null)}}foreach(e){this.foreach_(E(),e)}foreach_(e,t){this.children.inorderTraversal((s,i)=>{i.foreach_(P(e,s),t)}),this.value&&t(e,this.value)}foreachChild(e){this.children.inorderTraversal((t,s)=>{s.value&&e(t,s.value)})}}/**
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
 */class Y{constructor(e){this.writeTree_=e}static empty(){return new Y(new N(null))}}function rt(n,e,t){if(v(e))return new Y(new N(t));{const s=n.writeTree_.findRootMostValueAndPath(e);if(s!=null){const i=s.path;let r=s.value;const o=B(i,e);return r=r.updateChild(o,t),new Y(n.writeTree_.set(i,r))}else{const i=new N(t),r=n.writeTree_.setTree(e,i);return new Y(r)}}}function Hn(n,e,t){let s=n;return $(t,(i,r)=>{s=rt(s,P(e,i),r)}),s}function pi(n,e){if(v(e))return Y.empty();{const t=n.writeTree_.setTree(e,new N(null));return new Y(t)}}function jn(n,e){return Re(n,e)!=null}function Re(n,e){const t=n.writeTree_.findRootMostValueAndPath(e);return t!=null?n.writeTree_.get(t.path).getChild(B(t.path,e)):null}function _i(n){const e=[],t=n.writeTree_.value;return t!=null?t.isLeafNode()||t.forEachChild(A,(s,i)=>{e.push(new b(s,i))}):n.writeTree_.children.inorderTraversal((s,i)=>{i.value!=null&&e.push(new b(s,i.value))}),e}function ue(n,e){if(v(e))return n;{const t=Re(n,e);return t!=null?new Y(new N(t)):new Y(n.writeTree_.subtree(e))}}function Vn(n){return n.writeTree_.isEmpty()}function He(n,e){return Rr(E(),n.writeTree_,e)}function Rr(n,e,t){if(e.value!=null)return t.updateChild(n,e.value);{let s=null;return e.children.inorderTraversal((i,r)=>{i===".priority"?(f(r.value!==null,"Priority writes must always be leaf nodes"),s=r.value):t=Rr(P(n,i),r,t)}),!t.getChild(n).isEmpty()&&s!==null&&(t=t.updateChild(P(n,".priority"),s)),t}}/**
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
 */function nn(n,e){return Dr(e,n)}function Dc(n,e,t,s,i){f(s>n.lastWriteId,"Stacking an older write on top of newer ones"),i===void 0&&(i=!0),n.allWrites.push({path:e,snap:t,writeId:s,visible:i}),i&&(n.visibleWrites=rt(n.visibleWrites,e,t)),n.lastWriteId=s}function Pc(n,e,t,s){f(s>n.lastWriteId,"Stacking an older merge on top of newer ones"),n.allWrites.push({path:e,children:t,writeId:s,visible:!0}),n.visibleWrites=Hn(n.visibleWrites,e,t),n.lastWriteId=s}function Oc(n,e){for(let t=0;t<n.allWrites.length;t++){const s=n.allWrites[t];if(s.writeId===e)return s}return null}function Mc(n,e){const t=n.allWrites.findIndex(a=>a.writeId===e);f(t>=0,"removeWrite called with nonexistent writeId.");const s=n.allWrites[t];n.allWrites.splice(t,1);let i=s.visible,r=!1,o=n.allWrites.length-1;for(;i&&o>=0;){const a=n.allWrites[o];a.visible&&(o>=t&&xc(a,s.path)?i=!1:V(s.path,a.path)&&(r=!0)),o--}if(i){if(r)return Lc(n),!0;if(s.snap)n.visibleWrites=pi(n.visibleWrites,s.path);else{const a=s.children;$(a,l=>{n.visibleWrites=pi(n.visibleWrites,P(s.path,l))})}return!0}else return!1}function xc(n,e){if(n.snap)return V(n.path,e);for(const t in n.children)if(n.children.hasOwnProperty(t)&&V(P(n.path,t),e))return!0;return!1}function Lc(n){n.visibleWrites=Nr(n.allWrites,Fc,E()),n.allWrites.length>0?n.lastWriteId=n.allWrites[n.allWrites.length-1].writeId:n.lastWriteId=-1}function Fc(n){return n.visible}function Nr(n,e,t){let s=Y.empty();for(let i=0;i<n.length;++i){const r=n[i];if(e(r)){const o=r.path;let a;if(r.snap)V(t,o)?(a=B(t,o),s=rt(s,a,r.snap)):V(o,t)&&(a=B(o,t),s=rt(s,E(),r.snap.getChild(a)));else if(r.children){if(V(t,o))a=B(t,o),s=Hn(s,a,r.children);else if(V(o,t))if(a=B(o,t),v(a))s=Hn(s,E(),r.children);else{const l=Ce(r.children,y(a));if(l){const c=l.getChild(S(a));s=rt(s,E(),c)}}}else throw Ge("WriteRecord should have .snap or .children")}}return s}function kr(n,e,t,s,i){if(!s&&!i){const r=Re(n.visibleWrites,e);if(r!=null)return r;{const o=ue(n.visibleWrites,e);if(Vn(o))return t;if(t==null&&!jn(o,E()))return null;{const a=t||m.EMPTY_NODE;return He(o,a)}}}else{const r=ue(n.visibleWrites,e);if(!i&&Vn(r))return t;if(!i&&t==null&&!jn(r,E()))return null;{const o=function(c){return(c.visible||i)&&(!s||!~s.indexOf(c.writeId))&&(V(c.path,e)||V(e,c.path))},a=Nr(n.allWrites,o,e),l=t||m.EMPTY_NODE;return He(a,l)}}}function $c(n,e,t){let s=m.EMPTY_NODE;const i=Re(n.visibleWrites,e);if(i)return i.isLeafNode()||i.forEachChild(A,(r,o)=>{s=s.updateImmediateChild(r,o)}),s;if(t){const r=ue(n.visibleWrites,e);return t.forEachChild(A,(o,a)=>{const l=He(ue(r,new I(o)),a);s=s.updateImmediateChild(o,l)}),_i(r).forEach(o=>{s=s.updateImmediateChild(o.name,o.node)}),s}else{const r=ue(n.visibleWrites,e);return _i(r).forEach(o=>{s=s.updateImmediateChild(o.name,o.node)}),s}}function Bc(n,e,t,s,i){f(s||i,"Either existingEventSnap or existingServerSnap must exist");const r=P(e,t);if(jn(n.visibleWrites,r))return null;{const o=ue(n.visibleWrites,r);return Vn(o)?i.getChild(t):He(o,i.getChild(t))}}function Wc(n,e,t,s){const i=P(e,t),r=Re(n.visibleWrites,i);if(r!=null)return r;if(s.isCompleteForChild(t)){const o=ue(n.visibleWrites,i);return He(o,s.getNode().getImmediateChild(t))}else return null}function Uc(n,e){return Re(n.visibleWrites,e)}function Hc(n,e,t,s,i,r,o){let a;const l=ue(n.visibleWrites,e),c=Re(l,E());if(c!=null)a=c;else if(t!=null)a=He(l,t);else return[];if(a=a.withIndex(o),!a.isEmpty()&&!a.isLeafNode()){const d=[],u=o.getCompare(),h=r?a.getReverseIteratorFrom(s,o):a.getIteratorFrom(s,o);let p=h.getNext();for(;p&&d.length<i;)u(p,s)!==0&&d.push(p),p=h.getNext();return d}else return[]}function jc(){return{visibleWrites:Y.empty(),allWrites:[],lastWriteId:-1}}function Vt(n,e,t,s){return kr(n.writeTree,n.treePath,e,t,s)}function ps(n,e){return $c(n.writeTree,n.treePath,e)}function mi(n,e,t,s){return Bc(n.writeTree,n.treePath,e,t,s)}function Gt(n,e){return Uc(n.writeTree,P(n.treePath,e))}function Vc(n,e,t,s,i,r){return Hc(n.writeTree,n.treePath,e,t,s,i,r)}function _s(n,e,t){return Wc(n.writeTree,n.treePath,e,t)}function Ar(n,e){return Dr(P(n.treePath,e),n.writeTree)}function Dr(n,e){return{treePath:n,writeTree:e}}/**
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
 */class Gc{constructor(){this.changeMap=new Map}trackChildChange(e){const t=e.type,s=e.childName;f(t==="child_added"||t==="child_changed"||t==="child_removed","Only child changes supported for tracking"),f(s!==".priority","Only non-priority child changes can be tracked.");const i=this.changeMap.get(s);if(i){const r=i.type;if(t==="child_added"&&r==="child_removed")this.changeMap.set(s,pt(s,e.snapshotNode,i.snapshotNode));else if(t==="child_removed"&&r==="child_added")this.changeMap.delete(s);else if(t==="child_removed"&&r==="child_changed")this.changeMap.set(s,ft(s,i.oldSnap));else if(t==="child_changed"&&r==="child_added")this.changeMap.set(s,We(s,e.snapshotNode));else if(t==="child_changed"&&r==="child_changed")this.changeMap.set(s,pt(s,e.snapshotNode,i.oldSnap));else throw Ge("Illegal combination of changes: "+e+" occurred after "+i)}else this.changeMap.set(s,e)}getChanges(){return Array.from(this.changeMap.values())}}/**
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
 */class qc{getCompleteChild(e){return null}getChildAfterChild(e,t,s){return null}}const Pr=new qc;class ms{constructor(e,t,s=null){this.writes_=e,this.viewCache_=t,this.optCompleteServerCache_=s}getCompleteChild(e){const t=this.viewCache_.eventCache;if(t.isCompleteForChild(e))return t.getNode().getImmediateChild(e);{const s=this.optCompleteServerCache_!=null?new fe(this.optCompleteServerCache_,!0,!1):this.viewCache_.serverCache;return _s(this.writes_,e,s)}}getChildAfterChild(e,t,s){const i=this.optCompleteServerCache_!=null?this.optCompleteServerCache_:Ie(this.viewCache_),r=Vc(this.writes_,i,t,1,s,e);return r.length===0?null:r[0]}}/**
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
 */function zc(n){return{filter:n}}function Yc(n,e){f(e.eventCache.getNode().isIndexed(n.filter.getIndex()),"Event snap not indexed"),f(e.serverCache.getNode().isIndexed(n.filter.getIndex()),"Server snap not indexed")}function Kc(n,e,t,s,i){const r=new Gc;let o,a;if(t.type===z.OVERWRITE){const c=t;c.source.fromUser?o=Gn(n,e,c.path,c.snap,s,i,r):(f(c.source.fromServer,"Unknown source."),a=c.source.tagged||e.serverCache.isFiltered()&&!v(c.path),o=qt(n,e,c.path,c.snap,s,i,a,r))}else if(t.type===z.MERGE){const c=t;c.source.fromUser?o=Xc(n,e,c.path,c.children,s,i,r):(f(c.source.fromServer,"Unknown source."),a=c.source.tagged||e.serverCache.isFiltered(),o=qn(n,e,c.path,c.children,s,i,a,r))}else if(t.type===z.ACK_USER_WRITE){const c=t;c.revert?o=eu(n,e,c.path,s,i,r):o=Jc(n,e,c.path,c.affectedTree,s,i,r)}else if(t.type===z.LISTEN_COMPLETE)o=Zc(n,e,t.path,s,r);else throw Ge("Unknown operation type: "+t.type);const l=r.getChanges();return Qc(e,o,l),{viewCache:o,changes:l}}function Qc(n,e,t){const s=e.eventCache;if(s.isFullyInitialized()){const i=s.getNode().isLeafNode()||s.getNode().isEmpty(),r=jt(n);(t.length>0||!n.eventCache.isFullyInitialized()||i&&!s.getNode().equals(r)||!s.getNode().getPriority().equals(r.getPriority()))&&t.push(Sr(jt(e)))}}function Or(n,e,t,s,i,r){const o=e.eventCache;if(Gt(s,t)!=null)return e;{let a,l;if(v(t))if(f(e.serverCache.isFullyInitialized(),"If change path is empty, we must have complete server data"),e.serverCache.isFiltered()){const c=Ie(e),d=c instanceof m?c:m.EMPTY_NODE,u=ps(s,d);a=n.filter.updateFullNode(e.eventCache.getNode(),u,r)}else{const c=Vt(s,Ie(e));a=n.filter.updateFullNode(e.eventCache.getNode(),c,r)}else{const c=y(t);if(c===".priority"){f(de(t)===1,"Can't have a priority with additional path components");const d=o.getNode();l=e.serverCache.getNode();const u=mi(s,t,d,l);u!=null?a=n.filter.updatePriority(d,u):a=o.getNode()}else{const d=S(t);let u;if(o.isCompleteForChild(c)){l=e.serverCache.getNode();const h=mi(s,t,o.getNode(),l);h!=null?u=o.getNode().getImmediateChild(c).updateChild(d,h):u=o.getNode().getImmediateChild(c)}else u=_s(s,c,e.serverCache);u!=null?a=n.filter.updateChild(o.getNode(),c,u,d,i,r):a=o.getNode()}}return it(e,a,o.isFullyInitialized()||v(t),n.filter.filtersNodes())}}function qt(n,e,t,s,i,r,o,a){const l=e.serverCache;let c;const d=o?n.filter:n.filter.getIndexedFilter();if(v(t))c=d.updateFullNode(l.getNode(),s,null);else if(d.filtersNodes()&&!l.isFiltered()){const p=l.getNode().updateChild(t,s);c=d.updateFullNode(l.getNode(),p,null)}else{const p=y(t);if(!l.isCompleteForPath(t)&&de(t)>1)return e;const _=S(t),O=l.getNode().getImmediateChild(p).updateChild(_,s);p===".priority"?c=d.updatePriority(l.getNode(),O):c=d.updateChild(l.getNode(),p,O,_,Pr,null)}const u=Tr(e,c,l.isFullyInitialized()||v(t),d.filtersNodes()),h=new ms(i,u,r);return Or(n,u,t,i,h,a)}function Gn(n,e,t,s,i,r,o){const a=e.eventCache;let l,c;const d=new ms(i,e,r);if(v(t))c=n.filter.updateFullNode(e.eventCache.getNode(),s,o),l=it(e,c,!0,n.filter.filtersNodes());else{const u=y(t);if(u===".priority")c=n.filter.updatePriority(e.eventCache.getNode(),s),l=it(e,c,a.isFullyInitialized(),a.isFiltered());else{const h=S(t),p=a.getNode().getImmediateChild(u);let _;if(v(h))_=s;else{const w=d.getCompleteChild(u);w!=null?rs(h)===".priority"&&w.getChild(yr(h)).isEmpty()?_=w:_=w.updateChild(h,s):_=m.EMPTY_NODE}if(p.equals(_))l=e;else{const w=n.filter.updateChild(a.getNode(),u,_,h,d,o);l=it(e,w,a.isFullyInitialized(),n.filter.filtersNodes())}}}return l}function gi(n,e){return n.eventCache.isCompleteForChild(e)}function Xc(n,e,t,s,i,r,o){let a=e;return s.foreach((l,c)=>{const d=P(t,l);gi(e,y(d))&&(a=Gn(n,a,d,c,i,r,o))}),s.foreach((l,c)=>{const d=P(t,l);gi(e,y(d))||(a=Gn(n,a,d,c,i,r,o))}),a}function yi(n,e,t){return t.foreach((s,i)=>{e=e.updateChild(s,i)}),e}function qn(n,e,t,s,i,r,o,a){if(e.serverCache.getNode().isEmpty()&&!e.serverCache.isFullyInitialized())return e;let l=e,c;v(t)?c=s:c=new N(null).setTree(t,s);const d=e.serverCache.getNode();return c.children.inorderTraversal((u,h)=>{if(d.hasChild(u)){const p=e.serverCache.getNode().getImmediateChild(u),_=yi(n,p,h);l=qt(n,l,new I(u),_,i,r,o,a)}}),c.children.inorderTraversal((u,h)=>{const p=!e.serverCache.isCompleteForChild(u)&&h.value===null;if(!d.hasChild(u)&&!p){const _=e.serverCache.getNode().getImmediateChild(u),w=yi(n,_,h);l=qt(n,l,new I(u),w,i,r,o,a)}}),l}function Jc(n,e,t,s,i,r,o){if(Gt(i,t)!=null)return e;const a=e.serverCache.isFiltered(),l=e.serverCache;if(s.value!=null){if(v(t)&&l.isFullyInitialized()||l.isCompleteForPath(t))return qt(n,e,t,l.getNode().getChild(t),i,r,a,o);if(v(t)){let c=new N(null);return l.getNode().forEachChild(Fe,(d,u)=>{c=c.set(new I(d),u)}),qn(n,e,t,c,i,r,a,o)}else return e}else{let c=new N(null);return s.foreach((d,u)=>{const h=P(t,d);l.isCompleteForPath(h)&&(c=c.set(d,l.getNode().getChild(h)))}),qn(n,e,t,c,i,r,a,o)}}function Zc(n,e,t,s,i){const r=e.serverCache,o=Tr(e,r.getNode(),r.isFullyInitialized()||v(t),r.isFiltered());return Or(n,o,t,s,Pr,i)}function eu(n,e,t,s,i,r){let o;if(Gt(s,t)!=null)return e;{const a=new ms(s,e,i),l=e.eventCache.getNode();let c;if(v(t)||y(t)===".priority"){let d;if(e.serverCache.isFullyInitialized())d=Vt(s,Ie(e));else{const u=e.serverCache.getNode();f(u instanceof m,"serverChildren would be complete if leaf node"),d=ps(s,u)}d=d,c=n.filter.updateFullNode(l,d,r)}else{const d=y(t);let u=_s(s,d,e.serverCache);u==null&&e.serverCache.isCompleteForChild(d)&&(u=l.getImmediateChild(d)),u!=null?c=n.filter.updateChild(l,d,u,S(t),a,r):e.eventCache.getNode().hasChild(d)?c=n.filter.updateChild(l,d,m.EMPTY_NODE,S(t),a,r):c=l,c.isEmpty()&&e.serverCache.isFullyInitialized()&&(o=Vt(s,Ie(e)),o.isLeafNode()&&(c=n.filter.updateFullNode(c,o,r)))}return o=e.serverCache.isFullyInitialized()||Gt(s,E())!=null,it(e,c,o,n.filter.filtersNodes())}}/**
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
 */class tu{constructor(e,t){this.query_=e,this.eventRegistrations_=[];const s=this.query_._queryParams,i=new cs(s.getIndex()),r=vc(s);this.processor_=zc(r);const o=t.serverCache,a=t.eventCache,l=i.updateFullNode(m.EMPTY_NODE,o.getNode(),null),c=r.updateFullNode(m.EMPTY_NODE,a.getNode(),null),d=new fe(l,o.isFullyInitialized(),i.filtersNodes()),u=new fe(c,a.isFullyInitialized(),r.filtersNodes());this.viewCache_=tn(u,d),this.eventGenerator_=new Tc(this.query_)}get query(){return this.query_}}function nu(n){return n.viewCache_.serverCache.getNode()}function su(n){return jt(n.viewCache_)}function iu(n,e){const t=Ie(n.viewCache_);return t&&(n.query._queryParams.loadsAllData()||!v(e)&&!t.getImmediateChild(y(e)).isEmpty())?t.getChild(e):null}function vi(n){return n.eventRegistrations_.length===0}function ru(n,e){n.eventRegistrations_.push(e)}function bi(n,e,t){const s=[];if(t){f(e==null,"A cancel should cancel all event registrations.");const i=n.query._path;n.eventRegistrations_.forEach(r=>{const o=r.createCancelEvent(t,i);o&&s.push(o)})}if(e){let i=[];for(let r=0;r<n.eventRegistrations_.length;++r){const o=n.eventRegistrations_[r];if(!o.matches(e))i.push(o);else if(e.hasAnyCallback()){i=i.concat(n.eventRegistrations_.slice(r+1));break}}n.eventRegistrations_=i}else n.eventRegistrations_=[];return s}function Ci(n,e,t,s){e.type===z.MERGE&&e.source.queryId!==null&&(f(Ie(n.viewCache_),"We should always have a full cache before handling merges"),f(jt(n.viewCache_),"Missing event cache, even though we have a server cache"));const i=n.viewCache_,r=Kc(n.processor_,i,e,t,s);return Yc(n.processor_,r.viewCache),f(r.viewCache.serverCache.isFullyInitialized()||!i.serverCache.isFullyInitialized(),"Once a server snap is complete, it should never go back"),n.viewCache_=r.viewCache,Mr(n,r.changes,r.viewCache.eventCache.getNode(),null)}function ou(n,e){const t=n.viewCache_.eventCache,s=[];return t.getNode().isLeafNode()||t.getNode().forEachChild(A,(r,o)=>{s.push(We(r,o))}),t.isFullyInitialized()&&s.push(Sr(t.getNode())),Mr(n,s,t.getNode(),e)}function Mr(n,e,t,s){const i=s?[s]:n.eventRegistrations_;return Rc(n.eventGenerator_,e,t,i)}/**
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
 */let zt;class xr{constructor(){this.views=new Map}}function au(n){f(!zt,"__referenceConstructor has already been defined"),zt=n}function lu(){return f(zt,"Reference.ts has not been loaded"),zt}function cu(n){return n.views.size===0}function gs(n,e,t,s){const i=e.source.queryId;if(i!==null){const r=n.views.get(i);return f(r!=null,"SyncTree gave us an op for an invalid query."),Ci(r,e,t,s)}else{let r=[];for(const o of n.views.values())r=r.concat(Ci(o,e,t,s));return r}}function Lr(n,e,t,s,i){const r=e._queryIdentifier,o=n.views.get(r);if(!o){let a=Vt(t,i?s:null),l=!1;a?l=!0:s instanceof m?(a=ps(t,s),l=!1):(a=m.EMPTY_NODE,l=!1);const c=tn(new fe(a,l,!1),new fe(s,i,!1));return new tu(e,c)}return o}function uu(n,e,t,s,i,r){const o=Lr(n,e,s,i,r);return n.views.has(e._queryIdentifier)||n.views.set(e._queryIdentifier,o),ru(o,t),ou(o,t)}function hu(n,e,t,s){const i=e._queryIdentifier,r=[];let o=[];const a=pe(n);if(i==="default")for(const[l,c]of n.views.entries())o=o.concat(bi(c,t,s)),vi(c)&&(n.views.delete(l),c.query._queryParams.loadsAllData()||r.push(c.query));else{const l=n.views.get(i);l&&(o=o.concat(bi(l,t,s)),vi(l)&&(n.views.delete(i),l.query._queryParams.loadsAllData()||r.push(l.query)))}return a&&!pe(n)&&r.push(new(lu())(e._repo,e._path)),{removed:r,events:o}}function Fr(n){const e=[];for(const t of n.views.values())t.query._queryParams.loadsAllData()||e.push(t);return e}function he(n,e){let t=null;for(const s of n.views.values())t=t||iu(s,e);return t}function $r(n,e){if(e._queryParams.loadsAllData())return sn(n);{const s=e._queryIdentifier;return n.views.get(s)}}function Br(n,e){return $r(n,e)!=null}function pe(n){return sn(n)!=null}function sn(n){for(const e of n.views.values())if(e.query._queryParams.loadsAllData())return e;return null}/**
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
 */let Yt;function du(n){f(!Yt,"__referenceConstructor has already been defined"),Yt=n}function fu(){return f(Yt,"Reference.ts has not been loaded"),Yt}let pu=1;class wi{constructor(e){this.listenProvider_=e,this.syncPointTree_=new N(null),this.pendingWriteTree_=jc(),this.tagToQueryMap=new Map,this.queryToTagMap=new Map}}function ys(n,e,t,s,i){return Dc(n.pendingWriteTree_,e,t,s,i),i?Ye(n,new Ee(hs(),e,t)):[]}function _u(n,e,t,s){Pc(n.pendingWriteTree_,e,t,s);const i=N.fromObject(t);return Ye(n,new Ue(hs(),e,i))}function ae(n,e,t=!1){const s=Oc(n.pendingWriteTree_,e);if(Mc(n.pendingWriteTree_,e)){let r=new N(null);return s.snap!=null?r=r.set(E(),!0):$(s.children,o=>{r=r.set(new I(o),!0)}),Ye(n,new Ht(s.path,r,t))}else return[]}function Et(n,e,t){return Ye(n,new Ee(ds(),e,t))}function mu(n,e,t){const s=N.fromObject(t);return Ye(n,new Ue(ds(),e,s))}function gu(n,e){return Ye(n,new mt(ds(),e))}function yu(n,e,t){const s=vs(n,t);if(s){const i=bs(s),r=i.path,o=i.queryId,a=B(r,e),l=new mt(fs(o),a);return Cs(n,r,l)}else return[]}function Kt(n,e,t,s,i=!1){const r=e._path,o=n.syncPointTree_.get(r);let a=[];if(o&&(e._queryIdentifier==="default"||Br(o,e))){const l=hu(o,e,t,s);cu(o)&&(n.syncPointTree_=n.syncPointTree_.remove(r));const c=l.removed;if(a=l.events,!i){const d=c.findIndex(h=>h._queryParams.loadsAllData())!==-1,u=n.syncPointTree_.findOnPath(r,(h,p)=>pe(p));if(d&&!u){const h=n.syncPointTree_.subtree(r);if(!h.isEmpty()){const p=Cu(h);for(let _=0;_<p.length;++_){const w=p[_],O=w.query,J=jr(n,w);n.listenProvider_.startListening(ot(O),gt(n,O),J.hashFn,J.onComplete)}}}!u&&c.length>0&&!s&&(d?n.listenProvider_.stopListening(ot(e),null):c.forEach(h=>{const p=n.queryToTagMap.get(on(h));n.listenProvider_.stopListening(ot(h),p)}))}wu(n,c)}return a}function Wr(n,e,t,s){const i=vs(n,s);if(i!=null){const r=bs(i),o=r.path,a=r.queryId,l=B(o,e),c=new Ee(fs(a),l,t);return Cs(n,o,c)}else return[]}function vu(n,e,t,s){const i=vs(n,s);if(i){const r=bs(i),o=r.path,a=r.queryId,l=B(o,e),c=N.fromObject(t),d=new Ue(fs(a),l,c);return Cs(n,o,d)}else return[]}function zn(n,e,t,s=!1){const i=e._path;let r=null,o=!1;n.syncPointTree_.foreachOnPath(i,(h,p)=>{const _=B(h,i);r=r||he(p,_),o=o||pe(p)});let a=n.syncPointTree_.get(i);a?(o=o||pe(a),r=r||he(a,E())):(a=new xr,n.syncPointTree_=n.syncPointTree_.set(i,a));let l;r!=null?l=!0:(l=!1,r=m.EMPTY_NODE,n.syncPointTree_.subtree(i).foreachChild((p,_)=>{const w=he(_,E());w&&(r=r.updateImmediateChild(p,w))}));const c=Br(a,e);if(!c&&!e._queryParams.loadsAllData()){const h=on(e);f(!n.queryToTagMap.has(h),"View does not exist, but we have a tag");const p=Eu();n.queryToTagMap.set(h,p),n.tagToQueryMap.set(p,h)}const d=nn(n.pendingWriteTree_,i);let u=uu(a,e,t,d,r,l);if(!c&&!o&&!s){const h=$r(a,e);u=u.concat(Iu(n,e,h))}return u}function rn(n,e,t){const i=n.pendingWriteTree_,r=n.syncPointTree_.findOnPath(e,(o,a)=>{const l=B(o,e),c=he(a,l);if(c)return c});return kr(i,e,r,t,!0)}function bu(n,e){const t=e._path;let s=null;n.syncPointTree_.foreachOnPath(t,(c,d)=>{const u=B(c,t);s=s||he(d,u)});let i=n.syncPointTree_.get(t);i?s=s||he(i,E()):(i=new xr,n.syncPointTree_=n.syncPointTree_.set(t,i));const r=s!=null,o=r?new fe(s,!0,!1):null,a=nn(n.pendingWriteTree_,e._path),l=Lr(i,e,a,r?o.getNode():m.EMPTY_NODE,r);return su(l)}function Ye(n,e){return Ur(e,n.syncPointTree_,null,nn(n.pendingWriteTree_,E()))}function Ur(n,e,t,s){if(v(n.path))return Hr(n,e,t,s);{const i=e.get(E());t==null&&i!=null&&(t=he(i,E()));let r=[];const o=y(n.path),a=n.operationForChild(o),l=e.children.get(o);if(l&&a){const c=t?t.getImmediateChild(o):null,d=Ar(s,o);r=r.concat(Ur(a,l,c,d))}return i&&(r=r.concat(gs(i,n,s,t))),r}}function Hr(n,e,t,s){const i=e.get(E());t==null&&i!=null&&(t=he(i,E()));let r=[];return e.children.inorderTraversal((o,a)=>{const l=t?t.getImmediateChild(o):null,c=Ar(s,o),d=n.operationForChild(o);d&&(r=r.concat(Hr(d,a,l,c)))}),i&&(r=r.concat(gs(i,n,s,t))),r}function jr(n,e){const t=e.query,s=gt(n,t);return{hashFn:()=>(nu(e)||m.EMPTY_NODE).hash(),onComplete:i=>{if(i==="ok")return s?yu(n,t._path,s):gu(n,t._path);{const r=gl(i,t);return Kt(n,t,null,r)}}}}function gt(n,e){const t=on(e);return n.queryToTagMap.get(t)}function on(n){return n._path.toString()+"$"+n._queryIdentifier}function vs(n,e){return n.tagToQueryMap.get(e)}function bs(n){const e=n.indexOf("$");return f(e!==-1&&e<n.length-1,"Bad queryKey."),{queryId:n.substr(e+1),path:new I(n.substr(0,e))}}function Cs(n,e,t){const s=n.syncPointTree_.get(e);f(s,"Missing sync point for query tag that we're tracking");const i=nn(n.pendingWriteTree_,e);return gs(s,t,i,null)}function Cu(n){return n.fold((e,t,s)=>{if(t&&pe(t))return[sn(t)];{let i=[];return t&&(i=Fr(t)),$(s,(r,o)=>{i=i.concat(o)}),i}})}function ot(n){return n._queryParams.loadsAllData()&&!n._queryParams.isDefault()?new(fu())(n._repo,n._path):n}function wu(n,e){for(let t=0;t<e.length;++t){const s=e[t];if(!s._queryParams.loadsAllData()){const i=on(s),r=n.queryToTagMap.get(i);n.queryToTagMap.delete(i),n.tagToQueryMap.delete(r)}}}function Eu(){return pu++}function Iu(n,e,t){const s=e._path,i=gt(n,e),r=jr(n,t),o=n.listenProvider_.startListening(ot(e),i,r.hashFn,r.onComplete),a=n.syncPointTree_.subtree(s);if(i)f(!pe(a.value),"If we're adding a query, it shouldn't be shadowed");else{const l=a.fold((c,d,u)=>{if(!v(c)&&d&&pe(d))return[sn(d).query];{let h=[];return d&&(h=h.concat(Fr(d).map(p=>p.query))),$(u,(p,_)=>{h=h.concat(_)}),h}});for(let c=0;c<l.length;++c){const d=l[c];n.listenProvider_.stopListening(ot(d),gt(n,d))}}return o}/**
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
 */class ws{constructor(e){this.node_=e}getImmediateChild(e){const t=this.node_.getImmediateChild(e);return new ws(t)}node(){return this.node_}}class Es{constructor(e,t){this.syncTree_=e,this.path_=t}getImmediateChild(e){const t=P(this.path_,e);return new Es(this.syncTree_,t)}node(){return rn(this.syncTree_,this.path_)}}const Su=function(n){return n=n||{},n.timestamp=n.timestamp||new Date().getTime(),n},Ei=function(n,e,t){if(!n||typeof n!="object")return n;if(f(".sv"in n,"Unexpected leaf node or priority contents"),typeof n[".sv"]=="string")return Tu(n[".sv"],e,t);if(typeof n[".sv"]=="object")return Ru(n[".sv"],e);f(!1,"Unexpected server value: "+JSON.stringify(n,null,2))},Tu=function(n,e,t){switch(n){case"timestamp":return t.timestamp;default:f(!1,"Unexpected server value: "+n)}},Ru=function(n,e,t){n.hasOwnProperty("increment")||f(!1,"Unexpected server value: "+JSON.stringify(n,null,2));const s=n.increment;typeof s!="number"&&f(!1,"Unexpected increment value: "+s);const i=e.node();if(f(i!==null&&typeof i<"u","Expected ChildrenNode.EMPTY_NODE for nulls"),!i.isLeafNode())return s;const o=i.getValue();return typeof o!="number"?s:o+s},Vr=function(n,e,t,s){return Ss(e,new Es(t,n),s)},Is=function(n,e,t){return Ss(n,new ws(e),t)};function Ss(n,e,t){const s=n.getPriority().val(),i=Ei(s,e.getImmediateChild(".priority"),t);let r;if(n.isLeafNode()){const o=n,a=Ei(o.getValue(),e,t);return a!==o.getValue()||i!==o.getPriority().val()?new x(a,D(i)):n}else{const o=n;return r=o,i!==o.getPriority().val()&&(r=r.updatePriority(new x(i))),o.forEachChild(A,(a,l)=>{const c=Ss(l,e.getImmediateChild(a),t);c!==l&&(r=r.updateImmediateChild(a,c))}),r}}/**
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
 */class Ts{constructor(e="",t=null,s={children:{},childCount:0}){this.name=e,this.parent=t,this.node=s}}function an(n,e){let t=e instanceof I?e:new I(e),s=n,i=y(t);for(;i!==null;){const r=Ce(s.node.children,i)||{children:{},childCount:0};s=new Ts(i,s,r),t=S(t),i=y(t)}return s}function Ne(n){return n.node.value}function Rs(n,e){n.node.value=e,Yn(n)}function Gr(n){return n.node.childCount>0}function Nu(n){return Ne(n)===void 0&&!Gr(n)}function ln(n,e){$(n.node.children,(t,s)=>{e(new Ts(t,n,s))})}function qr(n,e,t,s){t&&e(n),ln(n,i=>{qr(i,e,!0)})}function ku(n,e,t){let s=n.parent;for(;s!==null;){if(e(s))return!0;s=s.parent}return!1}function It(n){return new I(n.parent===null?n.name:It(n.parent)+"/"+n.name)}function Yn(n){n.parent!==null&&Au(n.parent,n.name,n)}function Au(n,e,t){const s=Nu(t),i=Q(n.node.children,e);s&&i?(delete n.node.children[e],n.node.childCount--,Yn(n)):!s&&!i&&(n.node.children[e]=t.node,n.node.childCount++,Yn(n))}/**
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
 */const Du=/[\[\].#$\/\u0000-\u001F\u007F]/,Pu=/[\[\].#$\u0000-\u001F\u007F]/,Tn=10*1024*1024,Ns=function(n){return typeof n=="string"&&n.length!==0&&!Du.test(n)},zr=function(n){return typeof n=="string"&&n.length!==0&&!Pu.test(n)},Ou=function(n){return n&&(n=n.replace(/^\/*\.info(\/|$)/,"/")),zr(n)},ks=function(n){return n===null||typeof n=="string"||typeof n=="number"&&!Zt(n)||n&&typeof n=="object"&&Q(n,".sv")},Kn=function(n,e,t,s){St($e(n,"value"),e,t)},St=function(n,e,t){const s=t instanceof I?new Xl(t,n):t;if(e===void 0)throw new Error(n+"contains undefined "+ve(s));if(typeof e=="function")throw new Error(n+"contains a function "+ve(s)+" with contents = "+e.toString());if(Zt(e))throw new Error(n+"contains "+e.toString()+" "+ve(s));if(typeof e=="string"&&e.length>Tn/3&&Jt(e)>Tn)throw new Error(n+"contains a string greater than "+Tn+" utf8 bytes "+ve(s)+" ('"+e.substring(0,50)+"...')");if(e&&typeof e=="object"){let i=!1,r=!1;if($(e,(o,a)=>{if(o===".value")i=!0;else if(o!==".priority"&&o!==".sv"&&(r=!0,!Ns(o)))throw new Error(n+" contains an invalid key ("+o+") "+ve(s)+`.  Keys must be non-empty strings and can't contain ".", "#", "$", "/", "[", or "]"`);Jl(s,o),St(n,a,s),Zl(s)}),i&&r)throw new Error(n+' contains ".value" child '+ve(s)+" in addition to actual children.")}},Mu=function(n,e){let t,s;for(t=0;t<e.length;t++){s=e[t];const r=dt(s);for(let o=0;o<r.length;o++)if(!(r[o]===".priority"&&o===r.length-1)){if(!Ns(r[o]))throw new Error(n+"contains an invalid key ("+r[o]+") in path "+s.toString()+`. Keys must be non-empty strings and can't contain ".", "#", "$", "/", "[", or "]"`)}}e.sort(Ql);let i=null;for(t=0;t<e.length;t++){if(s=e[t],i!==null&&V(i,s))throw new Error(n+"contains a path "+i.toString()+" that is ancestor of another path "+s.toString());i=s}},Yr=function(n,e,t,s){const i=$e(n,"values");if(!(e&&typeof e=="object")||Array.isArray(e))throw new Error(i+" must be an object containing the children to replace.");const r=[];$(e,(o,a)=>{const l=new I(o);if(St(i,a,P(t,l)),rs(l)===".priority"&&!ks(a))throw new Error(i+"contains an invalid value for '"+l.toString()+"', which must be a valid Firebase priority (a string, finite number, server value, or null).");r.push(l)}),Mu(i,r)},xu=function(n,e,t){if(Zt(e))throw new Error($e(n,"priority")+"is "+e.toString()+", but must be a valid Firebase priority (a string, finite number, server value, or null).");if(!ks(e))throw new Error($e(n,"priority")+"must be a valid Firebase priority (a string, finite number, server value, or null).")},Kr=function(n,e,t,s){if(!zr(t))throw new Error($e(n,e)+'was an invalid path = "'+t+`". Paths must be non-empty strings and can't contain ".", "#", "$", "[", or "]"`)},Lu=function(n,e,t,s){t&&(t=t.replace(/^\/*\.info(\/|$)/,"/")),Kr(n,e,t)},Oe=function(n,e){if(y(e)===".info")throw new Error(n+" failed = Can't modify data under /.info/")},Fu=function(n,e){const t=e.path.toString();if(typeof e.repoInfo.host!="string"||e.repoInfo.host.length===0||!Ns(e.repoInfo.namespace)&&e.repoInfo.host.split(":")[0]!=="localhost"||t.length!==0&&!Ou(t))throw new Error($e(n,"url")+`must be a valid firebase URL and the path can't contain ".", "#", "$", "[", or "]".`)};/**
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
 */class $u{constructor(){this.eventLists_=[],this.recursionDepth_=0}}function cn(n,e){let t=null;for(let s=0;s<e.length;s++){const i=e[s],r=i.getPath();t!==null&&!os(r,t.path)&&(n.eventLists_.push(t),t=null),t===null&&(t={events:[],path:r}),t.events.push(i)}t&&n.eventLists_.push(t)}function Qr(n,e,t){cn(n,t),Xr(n,s=>os(s,e))}function j(n,e,t){cn(n,t),Xr(n,s=>V(s,e)||V(e,s))}function Xr(n,e){n.recursionDepth_++;let t=!0;for(let s=0;s<n.eventLists_.length;s++){const i=n.eventLists_[s];if(i){const r=i.path;e(r)?(Bu(n.eventLists_[s]),n.eventLists_[s]=null):t=!1}}t&&(n.eventLists_=[]),n.recursionDepth_--}function Bu(n){for(let e=0;e<n.events.length;e++){const t=n.events[e];if(t!==null){n.events[e]=null;const s=t.getEventRunner();nt&&F("event: "+t.toString()),qe(s)}}}/**
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
 */const Wu="repo_interrupt",Uu=25;class Hu{constructor(e,t,s,i){this.repoInfo_=e,this.forceRestClient_=t,this.authTokenProvider_=s,this.appCheckProvider_=i,this.dataUpdateCount=0,this.statsListener_=null,this.eventQueue_=new $u,this.nextWriteId_=1,this.interceptServerDataCallback_=null,this.onDisconnect_=Ut(),this.transactionQueueTree_=new Ts,this.persistentConnection_=null,this.key=this.repoInfo_.toURLString()}toString(){return(this.repoInfo_.secure?"https://":"http://")+this.repoInfo_.host}}function ju(n,e,t){if(n.stats_=ss(n.repoInfo_),n.forceRestClient_||Cl())n.server_=new Wt(n.repoInfo_,(s,i,r,o)=>{Ii(n,s,i,r,o)},n.authTokenProvider_,n.appCheckProvider_),setTimeout(()=>Si(n,!0),0);else{if(typeof t<"u"&&t!==null){if(typeof t!="object")throw new Error("Only objects are supported for option databaseAuthVariableOverride");try{M(t)}catch(s){throw new Error("Invalid authOverride provided: "+s)}}n.persistentConnection_=new ne(n.repoInfo_,e,(s,i,r,o)=>{Ii(n,s,i,r,o)},s=>{Si(n,s)},s=>{Gu(n,s)},n.authTokenProvider_,n.appCheckProvider_,t),n.server_=n.persistentConnection_}n.authTokenProvider_.addTokenChangeListener(s=>{n.server_.refreshAuthToken(s)}),n.appCheckProvider_.addTokenChangeListener(s=>{n.server_.refreshAppCheckToken(s.token)}),n.statsReporter_=Tl(n.repoInfo_,()=>new Sc(n.stats_,n.server_)),n.infoData_=new bc,n.infoSyncTree_=new wi({startListening:(s,i,r,o)=>{let a=[];const l=n.infoData_.getNode(s._path);return l.isEmpty()||(a=Et(n.infoSyncTree_,s._path,l),setTimeout(()=>{o("ok")},0)),a},stopListening:()=>{}}),As(n,"connected",!1),n.serverSyncTree_=new wi({startListening:(s,i,r,o)=>(n.server_.listen(s,r,i,(a,l)=>{const c=o(a,l);j(n.eventQueue_,s._path,c)}),[]),stopListening:(s,i)=>{n.server_.unlisten(s,i)}})}function Vu(n){const t=n.infoData_.getNode(new I(".info/serverTimeOffset")).val()||0;return new Date().getTime()+t}function Tt(n){return Su({timestamp:Vu(n)})}function Ii(n,e,t,s,i){n.dataUpdateCount++;const r=new I(e);t=n.interceptServerDataCallback_?n.interceptServerDataCallback_(e,t):t;let o=[];if(i)if(s){const l=Ot(t,c=>D(c));o=vu(n.serverSyncTree_,r,l,i)}else{const l=D(t);o=Wr(n.serverSyncTree_,r,l,i)}else if(s){const l=Ot(t,c=>D(c));o=mu(n.serverSyncTree_,r,l)}else{const l=D(t);o=Et(n.serverSyncTree_,r,l)}let a=r;o.length>0&&(a=je(n,r)),j(n.eventQueue_,a,o)}function Si(n,e){As(n,"connected",e),e===!1&&Ku(n)}function Gu(n,e){$(e,(t,s)=>{As(n,t,s)})}function As(n,e,t){const s=new I("/.info/"+e),i=D(t);n.infoData_.updateSnapshot(s,i);const r=Et(n.infoSyncTree_,s,i);j(n.eventQueue_,s,r)}function un(n){return n.nextWriteId_++}function qu(n,e,t){const s=bu(n.serverSyncTree_,e);return s!=null?Promise.resolve(s):n.server_.get(e).then(i=>{const r=D(i).withIndex(e._queryParams.getIndex());zn(n.serverSyncTree_,e,t,!0);let o;if(e._queryParams.loadsAllData())o=Et(n.serverSyncTree_,e._path,r);else{const a=gt(n.serverSyncTree_,e);o=Wr(n.serverSyncTree_,e._path,r,a)}return j(n.eventQueue_,e._path,o),Kt(n.serverSyncTree_,e,t,null,!0),r},i=>(Ke(n,"get for query "+M(e)+" failed: "+i),Promise.reject(new Error(i))))}function zu(n,e,t,s,i){Ke(n,"set",{path:e.toString(),value:t,priority:s});const r=Tt(n),o=D(t,s),a=rn(n.serverSyncTree_,e),l=Is(o,a,r),c=un(n),d=ys(n.serverSyncTree_,e,l,c,!0);cn(n.eventQueue_,d),n.server_.put(e.toString(),o.val(!0),(h,p)=>{const _=h==="ok";_||W("set at "+e+" failed: "+h);const w=ae(n.serverSyncTree_,c,!_);j(n.eventQueue_,e,w),_e(n,i,h,p)});const u=Ps(n,e);je(n,u),j(n.eventQueue_,u,[])}function Yu(n,e,t,s){Ke(n,"update",{path:e.toString(),value:t});let i=!0;const r=Tt(n),o={};if($(t,(a,l)=>{i=!1,o[a]=Vr(P(e,a),D(l),n.serverSyncTree_,r)}),i)F("update() called with empty data.  Don't do anything."),_e(n,s,"ok",void 0);else{const a=un(n),l=_u(n.serverSyncTree_,e,o,a);cn(n.eventQueue_,l),n.server_.merge(e.toString(),t,(c,d)=>{const u=c==="ok";u||W("update at "+e+" failed: "+c);const h=ae(n.serverSyncTree_,a,!u),p=h.length>0?je(n,e):e;j(n.eventQueue_,p,h),_e(n,s,c,d)}),$(t,c=>{const d=Ps(n,P(e,c));je(n,d)}),j(n.eventQueue_,e,[])}}function Ku(n){Ke(n,"onDisconnectEvents");const e=Tt(n),t=Ut();Un(n.onDisconnect_,E(),(i,r)=>{const o=Vr(i,r,n.serverSyncTree_,e);ze(t,i,o)});let s=[];Un(t,E(),(i,r)=>{s=s.concat(Et(n.serverSyncTree_,i,r));const o=Ps(n,i);je(n,o)}),n.onDisconnect_=Ut(),j(n.eventQueue_,E(),s)}function Qu(n,e,t){n.server_.onDisconnectCancel(e.toString(),(s,i)=>{s==="ok"&&Wn(n.onDisconnect_,e),_e(n,t,s,i)})}function Ti(n,e,t,s){const i=D(t);n.server_.onDisconnectPut(e.toString(),i.val(!0),(r,o)=>{r==="ok"&&ze(n.onDisconnect_,e,i),_e(n,s,r,o)})}function Xu(n,e,t,s,i){const r=D(t,s);n.server_.onDisconnectPut(e.toString(),r.val(!0),(o,a)=>{o==="ok"&&ze(n.onDisconnect_,e,r),_e(n,i,o,a)})}function Ju(n,e,t,s){if(Dn(t)){F("onDisconnect().update() called with empty data.  Don't do anything."),_e(n,s,"ok",void 0);return}n.server_.onDisconnectMerge(e.toString(),t,(i,r)=>{i==="ok"&&$(t,(o,a)=>{const l=D(a);ze(n.onDisconnect_,P(e,o),l)}),_e(n,s,i,r)})}function Zu(n,e,t){let s;y(e._path)===".info"?s=zn(n.infoSyncTree_,e,t):s=zn(n.serverSyncTree_,e,t),Qr(n.eventQueue_,e._path,s)}function eh(n,e,t){let s;y(e._path)===".info"?s=Kt(n.infoSyncTree_,e,t):s=Kt(n.serverSyncTree_,e,t),Qr(n.eventQueue_,e._path,s)}function th(n){n.persistentConnection_&&n.persistentConnection_.interrupt(Wu)}function Ke(n,...e){let t="";n.persistentConnection_&&(t=n.persistentConnection_.id+":"),F(t,...e)}function _e(n,e,t,s){e&&qe(()=>{if(t==="ok")e(null);else{const i=(t||"error").toUpperCase();let r=i;s&&(r+=": "+s);const o=new Error(r);o.code=i,e(o)}})}function nh(n,e,t,s,i,r){Ke(n,"transaction on "+e);const o={path:e,update:t,onComplete:s,status:null,order:Qi(),applyLocally:r,retryCount:0,unwatcher:i,abortReason:null,currentWriteId:null,currentInputSnapshot:null,currentOutputSnapshotRaw:null,currentOutputSnapshotResolved:null},a=Ds(n,e,void 0);o.currentInputSnapshot=a;const l=o.update(a.val());if(l===void 0)o.unwatcher(),o.currentOutputSnapshotRaw=null,o.currentOutputSnapshotResolved=null,o.onComplete&&o.onComplete(null,!1,o.currentInputSnapshot);else{St("transaction failed: Data returned ",l,o.path),o.status=0;const c=an(n.transactionQueueTree_,e),d=Ne(c)||[];d.push(o),Rs(c,d);let u;typeof l=="object"&&l!==null&&Q(l,".priority")?(u=Ce(l,".priority"),f(ks(u),"Invalid priority returned by transaction. Priority must be a valid string, finite number, server value, or null.")):u=(rn(n.serverSyncTree_,e)||m.EMPTY_NODE).getPriority().val();const h=Tt(n),p=D(l,u),_=Is(p,a,h);o.currentOutputSnapshotRaw=p,o.currentOutputSnapshotResolved=_,o.currentWriteId=un(n);const w=ys(n.serverSyncTree_,e,_,o.currentWriteId,o.applyLocally);j(n.eventQueue_,e,w),hn(n,n.transactionQueueTree_)}}function Ds(n,e,t){return rn(n.serverSyncTree_,e,t)||m.EMPTY_NODE}function hn(n,e=n.transactionQueueTree_){if(e||dn(n,e),Ne(e)){const t=Zr(n,e);f(t.length>0,"Sending zero length transaction queue"),t.every(i=>i.status===0)&&sh(n,It(e),t)}else Gr(e)&&ln(e,t=>{hn(n,t)})}function sh(n,e,t){const s=t.map(c=>c.currentWriteId),i=Ds(n,e,s);let r=i;const o=i.hash();for(let c=0;c<t.length;c++){const d=t[c];f(d.status===0,"tryToSendTransactionQueue_: items in queue should all be run."),d.status=1,d.retryCount++;const u=B(e,d.path);r=r.updateChild(u,d.currentOutputSnapshotRaw)}const a=r.val(!0),l=e;n.server_.put(l.toString(),a,c=>{Ke(n,"transaction put response",{path:l.toString(),status:c});let d=[];if(c==="ok"){const u=[];for(let h=0;h<t.length;h++)t[h].status=2,d=d.concat(ae(n.serverSyncTree_,t[h].currentWriteId)),t[h].onComplete&&u.push(()=>t[h].onComplete(null,!0,t[h].currentOutputSnapshotResolved)),t[h].unwatcher();dn(n,an(n.transactionQueueTree_,e)),hn(n,n.transactionQueueTree_),j(n.eventQueue_,e,d);for(let h=0;h<u.length;h++)qe(u[h])}else{if(c==="datastale")for(let u=0;u<t.length;u++)t[u].status===3?t[u].status=4:t[u].status=0;else{W("transaction at "+l.toString()+" failed: "+c);for(let u=0;u<t.length;u++)t[u].status=4,t[u].abortReason=c}je(n,e)}},o)}function je(n,e){const t=Jr(n,e),s=It(t),i=Zr(n,t);return ih(n,i,s),s}function ih(n,e,t){if(e.length===0)return;const s=[];let i=[];const o=e.filter(a=>a.status===0).map(a=>a.currentWriteId);for(let a=0;a<e.length;a++){const l=e[a],c=B(t,l.path);let d=!1,u;if(f(c!==null,"rerunTransactionsUnderNode_: relativePath should not be null."),l.status===4)d=!0,u=l.abortReason,i=i.concat(ae(n.serverSyncTree_,l.currentWriteId,!0));else if(l.status===0)if(l.retryCount>=Uu)d=!0,u="maxretry",i=i.concat(ae(n.serverSyncTree_,l.currentWriteId,!0));else{const h=Ds(n,l.path,o);l.currentInputSnapshot=h;const p=e[a].update(h.val());if(p!==void 0){St("transaction failed: Data returned ",p,l.path);let _=D(p);typeof p=="object"&&p!=null&&Q(p,".priority")||(_=_.updatePriority(h.getPriority()));const O=l.currentWriteId,J=Tt(n),Z=Is(_,h,J);l.currentOutputSnapshotRaw=_,l.currentOutputSnapshotResolved=Z,l.currentWriteId=un(n),o.splice(o.indexOf(O),1),i=i.concat(ys(n.serverSyncTree_,l.path,Z,l.currentWriteId,l.applyLocally)),i=i.concat(ae(n.serverSyncTree_,O,!0))}else d=!0,u="nodata",i=i.concat(ae(n.serverSyncTree_,l.currentWriteId,!0))}j(n.eventQueue_,t,i),i=[],d&&(e[a].status=2,(function(h){setTimeout(h,Math.floor(0))})(e[a].unwatcher),e[a].onComplete&&(u==="nodata"?s.push(()=>e[a].onComplete(null,!1,e[a].currentInputSnapshot)):s.push(()=>e[a].onComplete(new Error(u),!1,null))))}dn(n,n.transactionQueueTree_);for(let a=0;a<s.length;a++)qe(s[a]);hn(n,n.transactionQueueTree_)}function Jr(n,e){let t,s=n.transactionQueueTree_;for(t=y(e);t!==null&&Ne(s)===void 0;)s=an(s,t),e=S(e),t=y(e);return s}function Zr(n,e){const t=[];return eo(n,e,t),t.sort((s,i)=>s.order-i.order),t}function eo(n,e,t){const s=Ne(e);if(s)for(let i=0;i<s.length;i++)t.push(s[i]);ln(e,i=>{eo(n,i,t)})}function dn(n,e){const t=Ne(e);if(t){let s=0;for(let i=0;i<t.length;i++)t[i].status!==2&&(t[s]=t[i],s++);t.length=s,Rs(e,t.length>0?t:void 0)}ln(e,s=>{dn(n,s)})}function Ps(n,e){const t=It(Jr(n,e)),s=an(n.transactionQueueTree_,e);return ku(s,i=>{Rn(n,i)}),Rn(n,s),qr(s,i=>{Rn(n,i)}),t}function Rn(n,e){const t=Ne(e);if(t){const s=[];let i=[],r=-1;for(let o=0;o<t.length;o++)t[o].status===3||(t[o].status===1?(f(r===o-1,"All SENT items should be at beginning of queue."),r=o,t[o].status=3,t[o].abortReason="set"):(f(t[o].status===0,"Unexpected transaction status in abort"),t[o].unwatcher(),i=i.concat(ae(n.serverSyncTree_,t[o].currentWriteId,!0)),t[o].onComplete&&s.push(t[o].onComplete.bind(null,new Error("set"),!1,null))));r===-1?Rs(e,void 0):t.length=r+1,j(n.eventQueue_,It(e),i);for(let o=0;o<s.length;o++)qe(s[o])}}/**
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
 */function rh(n){let e="";const t=n.split("/");for(let s=0;s<t.length;s++)if(t[s].length>0){let i=t[s];try{i=decodeURIComponent(i.replace(/\+/g," "))}catch{}e+="/"+i}return e}function oh(n){const e={};n.charAt(0)==="?"&&(n=n.substring(1));for(const t of n.split("&")){if(t.length===0)continue;const s=t.split("=");s.length===2?e[decodeURIComponent(s[0])]=decodeURIComponent(s[1]):W(`Invalid query segment '${t}' in query '${n}'`)}return e}const Ri=function(n,e){const t=ah(n),s=t.namespace;t.domain==="firebase.com"&&ie(t.host+" is no longer supported. Please use <YOUR FIREBASE>.firebaseio.com instead"),(!s||s==="undefined")&&t.domain!=="localhost"&&ie("Cannot parse Firebase url. Please use https://<YOUR FIREBASE>.firebaseio.com"),t.secure||dl();const i=t.scheme==="ws"||t.scheme==="wss";return{repoInfo:new cr(t.host,t.secure,s,i,e,"",s!==t.subdomain),path:new I(t.pathString)}},ah=function(n){let e="",t="",s="",i="",r="",o=!0,a="https",l=443;if(typeof n=="string"){let c=n.indexOf("//");c>=0&&(a=n.substring(0,c-1),n=n.substring(c+2));let d=n.indexOf("/");d===-1&&(d=n.length);let u=n.indexOf("?");u===-1&&(u=n.length),e=n.substring(0,Math.min(d,u)),d<u&&(i=rh(n.substring(d,u)));const h=oh(n.substring(Math.min(n.length,u)));c=e.indexOf(":"),c>=0?(o=a==="https"||a==="wss",l=parseInt(e.substring(c+1),10)):c=e.length;const p=e.slice(0,c);if(p.toLowerCase()==="localhost")t="localhost";else if(p.split(".").length<=2)t=p;else{const _=e.indexOf(".");s=e.substring(0,_).toLowerCase(),t=e.substring(_+1),r=s}"ns"in h&&(r=h.ns)}return{host:e,port:l,domain:t,subdomain:s,secure:o,scheme:a,pathString:i,namespace:r}};/**
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
 */class lh{constructor(e,t,s,i){this.eventType=e,this.eventRegistration=t,this.snapshot=s,this.prevName=i}getPath(){const e=this.snapshot.ref;return this.eventType==="value"?e._path:e.parent._path}getEventType(){return this.eventType}getEventRunner(){return this.eventRegistration.getEventRunner(this)}toString(){return this.getPath().toString()+":"+this.eventType+":"+M(this.snapshot.exportVal())}}class ch{constructor(e,t,s){this.eventRegistration=e,this.error=t,this.path=s}getPath(){return this.path}getEventType(){return"cancel"}getEventRunner(){return this.eventRegistration.getEventRunner(this)}toString(){return this.path.toString()+":cancel"}}/**
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
 */class to{constructor(e,t){this.snapshotCallback=e,this.cancelCallback=t}onValue(e,t){this.snapshotCallback.call(null,e,t)}onCancel(e){return f(this.hasCancelCallback,"Raising a cancel event on a listener with no cancel callback"),this.cancelCallback.call(null,e)}get hasCancelCallback(){return!!this.cancelCallback}matches(e){return this.snapshotCallback===e.snapshotCallback||this.snapshotCallback.userCallback!==void 0&&this.snapshotCallback.userCallback===e.snapshotCallback.userCallback&&this.snapshotCallback.context===e.snapshotCallback.context}}/**
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
 */class uh{constructor(e,t){this._repo=e,this._path=t}cancel(){const e=new G;return Qu(this._repo,this._path,e.wrapCallback(()=>{})),e.promise}remove(){Oe("OnDisconnect.remove",this._path);const e=new G;return Ti(this._repo,this._path,null,e.wrapCallback(()=>{})),e.promise}set(e){Oe("OnDisconnect.set",this._path),Kn("OnDisconnect.set",e,this._path);const t=new G;return Ti(this._repo,this._path,e,t.wrapCallback(()=>{})),t.promise}setWithPriority(e,t){Oe("OnDisconnect.setWithPriority",this._path),Kn("OnDisconnect.setWithPriority",e,this._path),xu("OnDisconnect.setWithPriority",t);const s=new G;return Xu(this._repo,this._path,e,t,s.wrapCallback(()=>{})),s.promise}update(e){Oe("OnDisconnect.update",this._path),Yr("OnDisconnect.update",e,this._path);const t=new G;return Ju(this._repo,this._path,e,t.wrapCallback(()=>{})),t.promise}}/**
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
 */class Os{constructor(e,t,s,i){this._repo=e,this._path=t,this._queryParams=s,this._orderByCalled=i}get key(){return v(this._path)?null:rs(this._path)}get ref(){return new X(this._repo,this._path)}get _queryIdentifier(){const e=di(this._queryParams),t=ts(e);return t==="{}"?"default":t}get _queryObject(){return di(this._queryParams)}isEqual(e){if(e=me(e),!(e instanceof Os))return!1;const t=this._repo===e._repo,s=os(this._path,e._path),i=this._queryIdentifier===e._queryIdentifier;return t&&s&&i}toJSON(){return this.toString()}toString(){return this._repo.toString()+Kl(this._path)}}class X extends Os{constructor(e,t){super(e,t,new us,!1)}get parent(){const e=yr(this._path);return e===null?null:new X(this._repo,e)}get root(){let e=this;for(;e.parent!==null;)e=e.parent;return e}}class Ve{constructor(e,t,s){this._node=e,this.ref=t,this._index=s}get priority(){return this._node.getPriority().val()}get key(){return this.ref.key}get size(){return this._node.numChildren()}child(e){const t=new I(e),s=Qn(this.ref,e);return new Ve(this._node.getChild(t),s,A)}exists(){return!this._node.isEmpty()}exportVal(){return this._node.val(!0)}forEach(e){return this._node.isLeafNode()?!1:!!this._node.forEachChild(this._index,(s,i)=>e(new Ve(i,Qn(this.ref,s),A)))}hasChild(e){const t=new I(e);return!this._node.getChild(t).isEmpty()}hasChildren(){return this._node.isLeafNode()?!1:!this._node.isEmpty()}toJSON(){return this.exportVal()}val(){return this._node.val()}}function T(n,e){return n=me(n),n._checkNotDeleted("ref"),e!==void 0?Qn(n._root,e):n._root}function Qn(n,e){return n=me(n),y(n._path)===null?Lu("child","path",e):Kr("child","path",e),new X(n._repo,P(n._path,e))}function no(n){return n=me(n),new uh(n._repo,n._path)}function Ni(n,e){n=me(n),Oe("set",n._path),Kn("set",e,n._path);const t=new G;return zu(n._repo,n._path,e,null,t.wrapCallback(()=>{})),t.promise}function ke(n,e){Yr("update",e,n._path);const t=new G;return Yu(n._repo,n._path,e,t.wrapCallback(()=>{})),t.promise}function Se(n){n=me(n);const e=new to(()=>{}),t=new fn(e);return qu(n._repo,n,t).then(s=>new Ve(s,new X(n._repo,n._path),n._queryParams.getIndex()))}class fn{constructor(e){this.callbackContext=e}respondsTo(e){return e==="value"}createEvent(e,t){const s=t._queryParams.getIndex();return new lh("value",this,new Ve(e.snapshotNode,new X(t._repo,t._path),s))}getEventRunner(e){return e.getEventType()==="cancel"?()=>this.callbackContext.onCancel(e.error):()=>this.callbackContext.onValue(e.snapshot,null)}createCancelEvent(e,t){return this.callbackContext.hasCancelCallback?new ch(this,e,t):null}matches(e){return e instanceof fn?!e.callbackContext||!this.callbackContext?!0:e.callbackContext.matches(this.callbackContext):!1}hasAnyCallback(){return this.callbackContext!==null}}function hh(n,e,t,s,i){const r=new to(t,void 0),o=new fn(r);return Zu(n._repo,n,o),()=>eh(n._repo,n,o)}function pn(n,e,t,s){return hh(n,"value",e)}au(X);du(X);/**
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
 */const dh="FIREBASE_DATABASE_EMULATOR_HOST",Xn={};let fh=!1;function ph(n,e,t,s){const i=e.lastIndexOf(":"),r=e.substring(0,i),o=Zn(r);n.repoInfo_=new cr(e,o,n.repoInfo_.namespace,n.repoInfo_.webSocketOnly,n.repoInfo_.nodeAdmin,n.repoInfo_.persistenceKey,n.repoInfo_.includeNamespaceInQueryParams,!0,t),s&&(n.authTokenProvider_=s)}function _h(n,e,t,s,i){let r=s||n.options.databaseURL;r===void 0&&(n.options.projectId||ie("Can't determine Firebase Database URL. Be sure to include  a Project ID when calling firebase.initializeApp()."),F("Using default host for project ",n.options.projectId),r=`${n.options.projectId}-default-rtdb.firebaseio.com`);let o=Ri(r,i),a=o.repoInfo,l;typeof process<"u"&&Ys&&(l=Ys[dh]),l?(r=`http://${l}?ns=${a.namespace}`,o=Ri(r,i),a=o.repoInfo):o.repoInfo.secure;const c=new El(n.name,n.options,e);Fu("Invalid Firebase Database URL",o),v(o.path)||ie("Database URL must point to the root of a Firebase Database (not including a child path).");const d=gh(a,n,c,new wl(n,t));return new yh(d,n)}function mh(n,e){const t=Xn[e];(!t||t[n.key]!==n)&&ie(`Database ${e}(${n.repoInfo_}) has already been deleted.`),th(n),delete t[n.key]}function gh(n,e,t,s){let i=Xn[e.name];i||(i={},Xn[e.name]=i);let r=i[n.toURLString()];return r&&ie("Database initialized multiple times. Please make sure the format of the database URL matches with each database() call."),r=new Hu(n,fh,t,s),i[n.toURLString()]=r,r}class yh{constructor(e,t){this._repoInternal=e,this.app=t,this.type="database",this._instanceStarted=!1}get _repo(){return this._instanceStarted||(ju(this._repoInternal,this.app.options.appId,this.app.options.databaseAuthVariableOverride),this._instanceStarted=!0),this._repoInternal}get _root(){return this._rootInternal||(this._rootInternal=new X(this._repo,E())),this._rootInternal}_delete(){return this._rootInternal!==null&&(mh(this._repo,this.app.name),this._repoInternal=null,this._rootInternal=null),Promise.resolve()}_checkNotDeleted(e){this._rootInternal===null&&ie("Cannot call "+e+" on a deleted database.")}}function vh(n=Qa(),e){const t=Ga(n,"database").getImmediate({identifier:e});if(!t._instanceStarted){const s=Ao("database");s&&bh(t,...s)}return t}function bh(n,e,t,s={}){n=me(n),n._checkNotDeleted("useEmulator");const i=`${e}:${t}`,r=n._repoInternal;if(n._instanceStarted){if(i===n._repoInternal.repoInfo_.host&&Mt(s,r.repoInfo_.emulatorOptions))return;ie("connectDatabaseEmulator() cannot initialize or alter the emulator configuration after the database instance has started.")}let o;if(r.repoInfo_.nodeAdmin)s.mockUserToken&&ie('mockUserToken is not supported by the Admin SDK. For client access with mock users, please use the "firebase" package instead of "firebase-admin".'),o=new At(At.OWNER);else if(s.mockUserToken){const a=typeof s.mockUserToken=="string"?s.mockUserToken:Po(s.mockUserToken,n.app.options.projectId);o=new At(a)}Zn(e)&&(Do(e),xo("Database",!0)),ph(r,i,s,o)}/**
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
 */function Ch(n){al(Ka),Lt(new ct("database",(e,{instanceIdentifier:t})=>{const s=e.getProvider("app").getImmediate(),i=e.getProvider("auth-internal"),r=e.getProvider("app-check-internal");return _h(s,i,r,t)},"PUBLIC").setMultipleInstances(!0)),xe(Ks,Qs,n),xe(Ks,Qs,"esm2017")}/**
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
 */class wh{constructor(e,t){this.committed=e,this.snapshot=t}toJSON(){return{committed:this.committed,snapshot:this.snapshot.toJSON()}}}function re(n,e,t){var s;if(n=me(n),Oe("Reference.transaction",n._path),n.key===".length"||n.key===".keys")throw"Reference.transaction failed: "+n.key+" is a read-only object.";const i=(s=void 0)!==null&&s!==void 0?s:!0,r=new G,o=(l,c,d)=>{let u=null;l?r.reject(l):(u=new Ve(d,new X(n._repo,n._path),A),r.resolve(new wh(c,u)))},a=pn(n,()=>{});return nh(n._repo,n._path,e,o,a,i),r.promise}ne.prototype.simpleListen=function(n,e){this.sendRequest("q",{p:n},e)};ne.prototype.echo=function(n,e){this.sendRequest("echo",{d:n},e)};Ch();var Eh="firebase",Ih="11.10.0";/**
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
 */xe(Eh,Ih,"app");const Sh={apiKey:"AIzaSyBUWOun6Fc6R58T_FAxDB217kypYi_Y59c",authDomain:"mori-no-yakai.firebaseapp.com",databaseURL:"https://mori-no-yakai-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"mori-no-yakai",storageBucket:"mori-no-yakai.firebasestorage.app",messagingSenderId:"126231981141",appId:"1:126231981141:web:b593b219aeec9f8a7078dc",measurementId:"G-TK8226P7P9"},Th=Gi(Sh),R=vh(Th),C={villager:{id:"villager",name:"うさぎ",emoji:"🐰",team:"forest",description:"夜は何もせず眠っています。"},werewolf:{id:"werewolf",name:"おおかみ",emoji:"🐺",team:"wolf",description:"夜、仲間のおおかみと顔を見合わせます。1匹だけなら中央カードを1枚見られます。"},seer:{id:"seer",name:"ふくろう",emoji:"🦉",team:"forest",description:"夜、他の1人のカード、または中央カード2枚のどちらかを見られます。"},robber:{id:"robber",name:"きつね",emoji:"🦊",team:"forest",description:"夜、他の1人と自分のカードを交換し、新しい役職を確認します。"},minion:{id:"minion",name:"子狼",emoji:"🐾",team:"wolf",description:"夜、おおかみが誰かを確認します（自分の正体はおおかみ側には明かされません）。"}},Rh=["werewolf","minion","seer","robber"];function so(n){return{centerCount:3,werewolfCount:n<=5?1:2,seer:!0,robber:!0,minion:!0}}function Ms(n,e){const t=e.werewolfCount+(e.seer?1:0)+(e.robber?1:0)+(e.minion?1:0);return n+e.centerCount-t}function ki(n,e){return e.werewolfCount<0?!1:Ms(n,e)>=0}function Nh(n,e){const t=Ms(n,e);if(t<0)throw new Error("役職構成が不正です（うさぎの数がマイナスになります）");const s=[];for(let i=0;i<e.werewolfCount;i++)s.push("werewolf");e.seer&&s.push("seer"),e.robber&&s.push("robber"),e.minion&&s.push("minion");for(let i=0;i<t;i++)s.push("villager");return s}function kh(n){const e=new Set;return n.werewolfCount>0&&e.add("werewolf"),n.minion&&e.add("minion"),n.seer&&e.add("seer"),n.robber&&e.add("robber"),Rh.filter(t=>e.has(t))}function Ah(n,e=Math.random){const t=n.slice();for(let s=t.length-1;s>0;s--){const i=Math.floor(e()*(s+1));[t[s],t[i]]=[t[i],t[s]]}return t}const Dh=[15e3,3e4,45e3,6e4],xs=3e4,Ph=6e4,Oh=[3*6e4,5*6e4,8*6e4],Mh=5*6e4;function xh(n){const e={};for(const i of n)e[i.id]=0;for(const i of n)i.vote&&i.vote in e&&(e[i.vote]+=1);const t=Math.max(0,...Object.values(e)),s=t>=2?Object.entries(e).filter(([,i])=>i===t).map(([i])=>i):[];return{counts:e,eliminatedIds:s}}function Lh(n,e){const t=new Set(e);return n.some(r=>t.has(r.id)&&r.currentRole==="werewolf")||!n.some(r=>r.currentRole==="werewolf")&&(e.length===0||n.some(o=>t.has(o.id)&&o.currentRole==="minion"))?"forest":"wolf"}function Fh(n,e){const t=n.find(i=>i.id===e);if(t!=null&&t.online)return e;const s=n.filter(i=>i.online).sort((i,r)=>i.joinedAt-r.joinedAt);return s.length>0?s[0].id:e}function $h(n,e){const t=n.filter(s=>s.online);return t.length===0?!1:t.every(s=>(s.nightReadyStep??-1)>=e)}function io(n,e){const t=n.nightStepDurationMs??xs,s=n.nightStepIndex+1;return s>=n.nightOrder.length?{...n,phase:"discuss",discussEndsAt:e+n.discussDurationMs}:{...n,nightStepIndex:s,nightStepEndsAt:e+t}}function ro(n,e){return{...n,phase:"vote",voteEndsAt:e+Ph}}function Bh(n,e){const t=n.filter(s=>s.online);return t.length===0?!1:t.every(s=>s.discussReadyRound===e)}function oo(n){return{...n,phase:"result"}}const Ai="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";function Wh(){let n="";for(let e=0;e<5;e++)n+=Ai[Math.floor(Math.random()*Ai.length)];return n}function Uh(){return crypto.randomUUID()}async function ao(n,e,t){const s=T(R,`rooms/${n}/members/${e}`),i=T(R,`rooms/${n}/state`);if(!(await Se(i)).exists()){const a={phase:"lobby",hostId:e,createdAt:Date.now(),roleConfig:so(1),nightOrder:[],nightStepIndex:0,nightStepDurationMs:xs,nightStepEndsAt:0,discussDurationMs:Mh,discussEndsAt:0,voteEndsAt:0,roundNumber:0};await Ni(i,a)}if((await Se(s)).exists())await ke(s,{name:t,online:!0});else{const a={id:e,name:t,online:!0,joinedAt:Date.now()};await Ni(s,a)}no(T(R,`rooms/${n}/members/${e}/online`)).set(!1)}async function Hh(n,e){await ke(T(R,`rooms/${n}/members/${e}`),{online:!0}),no(T(R,`rooms/${n}/members/${e}/online`)).set(!1)}async function jh(n,e){await ke(T(R,`rooms/${n}/members/${e}`),{online:!1})}function Vh(n,e){return pn(T(R,`rooms/${n}/state`),t=>e(t.val()))}function Gh(n,e){return pn(T(R,`rooms/${n}/members`),t=>e(t.val()??{}))}function qh(n,e){return pn(T(R,`rooms/${n}/centerCards`),t=>{const s=t.val();if(Array.isArray(s)){e({round:-1,cards:s});return}e(s)})}async function zh(n,e){await ke(T(R,`rooms/${n}/state`),{roleConfig:e})}async function Yh(n,e){await ke(T(R,`rooms/${n}/state`),{discussDurationMs:e})}function Kh(n){return so(n)}async function Qh(n){await re(T(R,`rooms/${n}`),e=>{if(!e||!e.state||e.state.phase!=="lobby")return e;const t=e.members??{},s=Object.keys(t).filter(u=>t[u].online);if(s.length<3)return e;const i=Nh(s.length,e.state.roleConfig),r=Ah(i),o=r.slice(0,s.length),a=r.slice(s.length);for(const u of Object.keys(t))delete t[u].originalRole,delete t[u].currentRole,delete t[u].vote,delete t[u].nightReadyStep,delete t[u].discussReadyRound;s.forEach((u,h)=>{t[u].originalRole=o[h],t[u].currentRole=o[h]});const l=kh(e.state.roleConfig),c=e.state.nightStepDurationMs??xs,d=(e.state.roundNumber??0)+1;return e.members=t,e.centerCards={round:d,cards:a},e.state={...e.state,phase:l.length>0?"night":"discuss",nightOrder:l,nightStepIndex:0,nightStepDurationMs:c,nightStepEndsAt:Date.now()+c,discussEndsAt:Date.now()+e.state.discussDurationMs,roundNumber:d},e})}async function Xh(n,e){await ke(T(R,`rooms/${n}/state`),{nightStepDurationMs:e})}async function Jh(n,e,t){const s=T(R,`rooms/${n}/members/${e}/currentRole`),i=T(R,`rooms/${n}/members/${t}/currentRole`),[r,o]=await Promise.all([Se(s),Se(i)]),a=r.val(),l=o.val();return await ke(T(R,`rooms/${n}/members`),{[`${e}/currentRole`]:l,[`${t}/currentRole`]:a}),l}async function Zh(n,e,t){await re(T(R,`rooms/${n}`),s=>{var i;return!s||!s.state||s.state.phase!=="vote"||!((i=s.members)!=null&&i[e])||(s.members[e].vote=t),s})}async function ed(n){await re(T(R,`rooms/${n}`),e=>{if(!e||!e.state)return e;const t=e.state,s=Date.now();return t.phase==="night"&&s>=t.nightStepEndsAt?e.state=io(t,s):t.phase==="discuss"&&s>=t.discussEndsAt?e.state=ro(t,s):t.phase==="vote"&&s>=t.voteEndsAt&&(e.state=oo(t)),e})}async function td(n,e,t){await re(T(R,`rooms/${n}`),s=>{var i;return!(s!=null&&s.state)||s.state.phase!=="night"||s.state.nightStepIndex!==t||!((i=s.members)!=null&&i[e])||(s.members[e].nightReadyStep=t),s}),await nd(n)}async function nd(n){const t=(await Se(T(R,`rooms/${n}`))).val();if(!(t!=null&&t.state)||t.state.phase!=="night")return;const s=t.members??{},i=Object.values(s).filter(r=>r.originalRole);$h(i,t.state.nightStepIndex)&&await re(T(R,`rooms/${n}`),r=>(!(r!=null&&r.state)||r.state.phase!=="night"||r.state.nightStepIndex!==t.state.nightStepIndex||(r.state=io(r.state,Date.now())),r))}async function sd(n,e,t){await re(T(R,`rooms/${n}`),s=>{var i;return!(s!=null&&s.state)||s.state.phase!=="discuss"||s.state.roundNumber!==t||!((i=s.members)!=null&&i[e])||(s.members[e].discussReadyRound=t),s}),await id(n)}async function id(n){const t=(await Se(T(R,`rooms/${n}`))).val();if(!(t!=null&&t.state)||t.state.phase!=="discuss")return;const s=t.members??{},i=Object.values(s).filter(r=>r.originalRole);Bh(i,t.state.roundNumber)&&await re(T(R,`rooms/${n}`),r=>(!(r!=null&&r.state)||r.state.phase!=="discuss"||r.state.roundNumber!==t.state.roundNumber||(r.state=ro(r.state,Date.now())),r))}async function rd(n){const t=(await Se(T(R,`rooms/${n}/members`))).val()??{},s=Object.values(t).filter(i=>i.online&&i.originalRole);s.length===0||!s.every(i=>i.vote)||await re(T(R,`rooms/${n}`),i=>(!(i!=null&&i.state)||i.state.phase!=="vote"||(i.state=oo(i.state)),i))}async function od(n){await re(T(R,`rooms/${n}`),e=>{if(!e||!e.state)return e;const t=e.members??{};for(const s of Object.keys(t))delete t[s].originalRole,delete t[s].currentRole,delete t[s].vote,delete t[s].nightReadyStep,delete t[s].discussReadyRound;return e.members=t,e.centerCards=null,e.state={...e.state,phase:"lobby",nightOrder:[],nightStepIndex:0,nightStepEndsAt:0,voteEndsAt:0},e})}function lo(n){return Fh(Object.values(n.members),n.state.hostId)}function co(n){return lo(n)===n.memberId}function Ls(n){return Object.values(n.members).filter(e=>e.online)}function Ae(n){return Object.values(n.members).filter(e=>e.originalRole)}function _n(n){var s;const e=(s=n.members[n.memberId])==null?void 0:s.currentRole;if(!e)return"";const t=C[e];return`<p class="role-reminder">${t.emoji} あなたは ${t.name}</p>`}function ad(n,e){var c,d;const t=co(e),s=Ls(e),i=e.state.roleConfig,r=e.state.discussDurationMs,o=e.state.nightStepDurationMs,a=Ms(s.length,i),l=ki(s.length,i)&&s.length>=3;n.innerHTML=`
    <h2>🌙 森の夜会</h2>
    <button id="btn-leave-room" class="btn-link">← トップに戻る</button>
    <div class="room-code-box">
      部屋コード
      <div class="room-code">${e.roomId}</div>
    </div>

    <h3>参加者（${s.length}人）</h3>
    <ul class="member-list">
      ${s.map(u=>`<li>${hd(u.name)}${u.id===lo(e)?" 👑":""}</li>`).join("")}
    </ul>

    ${t?cd(i,a,r,o):'<p class="waiting-text">ホストの開始を待っています…</p>'}

    ${ld(i)}

    ${t?`<button id="btn-start-game" class="btn-primary" ${l?"":"disabled"}>ゲーム開始</button>
           ${s.length<3?'<p class="error-text">3人以上で開始できます</p>':""}
           ${ki(s.length,i)?"":'<p class="error-text">役職の合計枚数が多すぎます。うさぎの数がマイナスになっています。</p>'}`:""}
  `,(c=n.querySelector("#btn-leave-room"))==null||c.addEventListener("click",()=>{e.requestLeaveRoom()}),t&&(ud(n,e,i,s.length),(d=n.querySelector("#btn-start-game"))==null||d.addEventListener("click",()=>{Qh(e.roomId)}))}function ld(n){const e=["villager","werewolf"];return n.seer&&e.push("seer"),n.robber&&e.push("robber"),n.minion&&e.push("minion"),`
    <h3>役職の説明</h3>
    <ul class="role-legend">
      ${e.map(t=>`<li>
            <strong>${C[t].emoji} ${C[t].name}</strong>
            <span class="hint-text">${C[t].description}</span>
          </li>`).join("")}
    </ul>
  `}function cd(n,e,t,s){return`
    <div class="lobby-settings">
      <h3>役職構成</h3>
      <div class="setting-row">
        <span>${C.werewolf.emoji} おおかみ</span>
        <div class="stepper">
          <button data-action="wolf-dec" class="btn-step">-</button>
          <span>${n.werewolfCount}</span>
          <button data-action="wolf-inc" class="btn-step">+</button>
        </div>
      </div>
      ${Nn("seer",n.seer)}
      ${Nn("robber",n.robber)}
      ${Nn("minion",n.minion)}
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
        ${Dh.map(i=>`<button data-night-step="${i}" class="btn-toggle ${i===s?"active":""}">${i/1e3}秒</button>`).join("")}
      </div>

      <h3>議論タイマー</h3>
      <div class="setting-row">
        ${Oh.map(i=>`<button data-discuss="${i}" class="btn-toggle ${i===t?"active":""}">${i/6e4}分</button>`).join("")}
      </div>
    </div>
  `}function Nn(n,e){const t=C[n];return`
    <div class="setting-row">
      <span>${t.emoji} ${t.name}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-role-toggle="${n}" ${e?"checked":""} />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `}function ud(n,e,t,s){var r,o,a;const i=l=>void zh(e.roomId,l);(r=n.querySelector('[data-action="wolf-inc"]'))==null||r.addEventListener("click",()=>{i({...t,werewolfCount:t.werewolfCount+1})}),(o=n.querySelector('[data-action="wolf-dec"]'))==null||o.addEventListener("click",()=>{i({...t,werewolfCount:Math.max(0,t.werewolfCount-1)})}),["seer","robber","minion"].forEach(l=>{var c;(c=n.querySelector(`[data-role-toggle="${l}"]`))==null||c.addEventListener("change",d=>{const u=d.target.checked;i({...t,[l]:u})})}),n.querySelectorAll("[data-center]").forEach(l=>{l.addEventListener("click",()=>{const c=Number(l.dataset.center);i({...t,centerCount:c})})}),n.querySelectorAll("[data-night-step]").forEach(l=>{l.addEventListener("click",()=>{const c=Number(l.dataset.nightStep);Xh(e.roomId,c)})}),n.querySelectorAll("[data-discuss]").forEach(l=>{l.addEventListener("click",()=>{const c=Number(l.dataset.discuss);Yh(e.roomId,c)})}),(a=n.querySelector("#btn-reset-config"))==null||a.addEventListener("click",()=>{i(Kh(s))})}function hd(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}let g={step:-1,round:-1};function ee(n,e){var _;const t=e.state.nightStepIndex,s=e.state.roundNumber;(g.step!==t||g.round!==s)&&(g={step:t,round:s}),!g.centerCardsSnapshot&&e.centerCards.length>0&&(g.centerCardsSnapshot=e.centerCards);const i=e.state.nightOrder[t],r=e.members[e.memberId],o=Math.max(0,Math.ceil((e.state.nightStepEndsAt-Date.now())/1e3)),a=(r==null?void 0:r.originalRole)===i,l=g.readyTapped||((r==null?void 0:r.nightReadyStep)??-1)>=t,c=l||g.robberPending===!0,d=`
    <h2>🌙 夜がふけていく…</h2>
    ${_n(e)}
    <div class="night-timer">${o}秒</div>
  `,u=a?l?dd(i,e):fd(i,e):`
      <p class="waiting-text">${C[i].emoji} だれかが行動中…しずかに待とう</p>
      <p class="role-description">${C[i].name}：${C[i].description}</p>
    `,h=Ls(e).filter(w=>w.originalRole),p=h.filter(w=>(w.nightReadyStep??-1)>=t).length;n.innerHTML=`
    ${d}
    ${u}
    <button id="btn-night-ready" class="btn-primary" ${c?"disabled":""}>
      ${l?"つぎを待っています…":g.robberPending?"交換中…":"つぎへ"}
    </button>
    <p class="hint-text">準備完了 ${p}/${h.length}人</p>
    <p class="hint-text">全員がタップすると次に進みます（役職と関係なく全員タップしてください）</p>
  `,a&&!l&&pd(n,i,e),(_=n.querySelector("#btn-night-ready"))==null||_.addEventListener("click",()=>{g.readyTapped||g.robberPending||(g.readyTapped=!0,ee(n,e),td(e.roomId,e.memberId,t))})}function dd(n,e){switch(n){case"werewolf":return Ae(e).filter(s=>s.originalRole==="werewolf").length>=2||g.wolfPeekIndex!==void 0?uo(e):`<p>${C.werewolf.emoji} 中央カードは見ませんでした。</p>`;case"minion":return ho(e);case"seer":return g.seerChoice?fo(e):`<p>${C.seer.emoji} 何も見ませんでした。</p>`;case"robber":return g.robberResult?po(e):`<p>${C.robber.emoji} 誰とも交換しませんでした。</p>`;case"villager":return"<p>あなたはうさぎ。することはありません。</p>"}}function fd(n,e){switch(n){case"werewolf":return uo(e);case"minion":return ho(e);case"seer":return fo(e);case"robber":return po(e);case"villager":return`
        <p>${C.villager.emoji} あなたはうさぎ。することはありません。</p>
        <p class="role-description">${C.villager.description}</p>
      `}}function uo(n){const e=Ae(n).filter(r=>r.originalRole==="werewolf"),t=e.filter(r=>r.id!==n.memberId),s=`<p class="role-description">${C.werewolf.description}</p>`;if(e.length>=2)return`
      <p>${C.werewolf.emoji} あなたはおおかみ。仲間は…</p>
      <ul class="member-list">${t.map(r=>`<li>${yt(r.name)}</li>`).join("")}</ul>
      ${s}
    `;const i=g.centerCardsSnapshot??n.centerCards;if(g.wolfPeekIndex!==void 0){const r=i[g.wolfPeekIndex];return`
      <p>${C.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
      <p>中央カード${g.wolfPeekIndex+1}は ${C[r].emoji} ${C[r].name}</p>
      ${s}
    `}return i.length===0?`
      <p>${C.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
      <p class="hint-text">中央カードを読み込み中…</p>
      ${s}
    `:`
    <p>${C.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
    <p>中央カードを1枚だけ見られます。</p>
    <div class="center-card-row">
      ${i.map((r,o)=>`<button data-center-peek="${o}" class="btn-card">中央${o+1}</button>`).join("")}
    </div>
    ${s}
  `}function ho(n){const e=Ae(n).filter(t=>t.originalRole==="werewolf");return`
    <p>${C.minion.emoji} あなたは子狼。おおかみ陣営の仲間は…</p>
    ${e.length>0?`<ul class="member-list">${e.map(t=>`<li>${yt(t.name)}</li>`).join("")}</ul>`:"<p>場にはおおかみがいません。あなただけがおおかみ陣営です。</p>"}
    <p class="role-description">${C.minion.description}</p>
  `}function fo(n){const e=`<p class="role-description">${C.seer.description}</p>`,t=g.centerCardsSnapshot??n.centerCards;if(g.seerChoice==="player"&&g.seerTargetId){const r=n.members[g.seerTargetId];return`<p>${yt(r.name)}の役職は ${C[r.currentRole].emoji} ${C[r.currentRole].name}</p>${e}`}if(g.seerChoice==="center")return`<p>中央カードは ${t.map((o,a)=>a).slice(0,2).map(o=>`${C[t[o]].emoji} ${C[t[o]].name}`).join(" と ")}</p>${e}`;if(g.seerChoice==="skip")return`<p>何も見ませんでした。</p>${e}`;const s=Ae(n).filter(r=>r.id!==n.memberId),i=t.length>0?'<button data-seer-center class="btn-card">中央2枚を見る</button>':'<span class="hint-text">中央カードを読み込み中…</span>';return`
    <p>${C.seer.emoji} あなたはふくろう。何を見ますか？</p>
    <p class="hint-text">他の1人 か 中央カード2枚、どちらか片方だけ見られます。</p>
    <div class="member-list">
      ${s.map(r=>`<button data-seer-player="${r.id}" class="btn-card">${yt(r.name)}</button>`).join("")}
    </div>
    <div class="center-card-row">
      ${i}
    </div>
    <button data-seer-skip class="btn-link">何も見ない</button>
    ${e}
  `}function po(n){const e=`<p class="role-description">${C.robber.description}</p>`;if(g.robberResult)return`<p>${C.robber.emoji} 交換後、あなたの役職は ${C[g.robberResult].emoji} ${C[g.robberResult].name}</p>${e}`;if(g.robberPending)return`<p>${C.robber.emoji} 交換中…</p>${e}`;const t=Ae(n).filter(s=>s.id!==n.memberId);return`
    <p>${C.robber.emoji} あなたはきつね。誰かと役職を交換しますか？</p>
    <div class="member-list">
      ${t.map(s=>`<button data-robber-target="${s.id}" class="btn-card">${yt(s.name)}</button>`).join("")}
    </div>
    <button data-robber-skip class="btn-link">だれとも交換しない</button>
    ${e}
  `}function pd(n,e,t){var s,i,r;e==="werewolf"&&n.querySelectorAll("[data-center-peek]").forEach(o=>{o.addEventListener("click",()=>{g.wolfPeekIndex===void 0&&(g.wolfPeekIndex=Number(o.dataset.centerPeek),ee(n,t))})}),e==="seer"&&(n.querySelectorAll("[data-seer-player]").forEach(o=>{o.addEventListener("click",()=>{g.seerChoice||(g.seerChoice="player",g.seerTargetId=o.dataset.seerPlayer,ee(n,t))})}),(s=n.querySelector("[data-seer-center]"))==null||s.addEventListener("click",()=>{g.seerChoice||(g.seerChoice="center",ee(n,t))}),(i=n.querySelector("[data-seer-skip]"))==null||i.addEventListener("click",()=>{g.seerChoice||(g.seerChoice="skip",ee(n,t))})),e==="robber"&&(n.querySelectorAll("[data-robber-target]").forEach(o=>{o.addEventListener("click",()=>{if(g.robberPending||g.robberResult)return;g.robberPending=!0;const a=o.dataset.robberTarget;ee(n,t),Jh(t.roomId,t.memberId,a).then(l=>{g.robberPending=!1,g.robberResult=l,ee(n,t)})})}),(r=n.querySelector("[data-robber-skip]"))==null||r.addEventListener("click",()=>{g.robberPending||g.robberResult||(g.robberResult=t.members[t.memberId].currentRole,ee(n,t))}))}function yt(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}let et={round:-1};function _o(n,e){var u;const t=e.state.roundNumber;et.round!==t&&(et={round:t});const s=e.members[e.memberId],i=Math.max(0,Math.ceil((e.state.discussEndsAt-Date.now())/1e3)),r=Math.floor(i/60),o=i%60,a=s==null?void 0:s.currentRole,l=et.readyTapped||(s==null?void 0:s.discussReadyRound)===t,c=Ls(e).filter(h=>h.originalRole),d=c.filter(h=>h.discussReadyRound===t).length;n.innerHTML=`
    <h2>🗣️ 議論タイム</h2>
    ${_n(e)}
    <div class="discuss-timer">${r}:${String(o).padStart(2,"0")}</div>
    ${a?`<p class="role-description">${C[a].description}</p>`:""}
    <p class="hint-text">声に出して話し合おう。うそをついてもOK！</p>
    <button id="btn-discuss-ready" class="btn-primary" ${l?"disabled":""}>
      ${l?"投票を待っています…":"話し合いおわり・投票へ"}
    </button>
    <p class="hint-text">準備完了 ${d}/${c.length}人</p>
  `,(u=n.querySelector("#btn-discuss-ready"))==null||u.addEventListener("click",()=>{et.readyTapped||(et.readyTapped=!0,_o(n,e),sd(e.roomId,e.memberId,t))})}function _d(n,e){const t=e.members[e.memberId],s=Ae(e),i=s.filter(a=>a.id!==e.memberId),r=Math.max(0,Math.ceil((e.state.voteEndsAt-Date.now())/1e3)),o=s.filter(a=>a.vote).length;if(!(t!=null&&t.originalRole)){n.innerHTML=`
      <h2>🗳️ 投票</h2>
      <p class="waiting-text">このゲームには参加していません。結果を待ちましょう。</p>
    `;return}n.innerHTML=`
    <h2>🗳️ 投票</h2>
    ${_n(e)}
    <div class="vote-timer">${r}秒</div>
    <p class="hint-text">あやしいと思う相手に1人投票しよう（${o}/${s.length}人 投票済み）</p>
    <p class="hint-text">誰も2票以上を集めなければ、誰も脱落しません。</p>
    <div class="member-list vote-list">
      ${i.map(a=>`<button data-vote-target="${a.id}" class="btn-card ${(t==null?void 0:t.vote)===a.id?"active":""}">${md(a.name)}${a.online?"":"（切断中）"}</button>`).join("")}
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
  `,n.querySelectorAll("[data-vote-target]").forEach(a=>{a.addEventListener("click",async()=>{const l=a.dataset.voteTarget;await Zh(e.roomId,e.memberId,l),await rd(e.roomId)})})}function md(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}function gd(n,e){var a,l;const t=Ae(e),{counts:s,eliminatedIds:i}=xh(t),r=Lh(t,i),o=new Set(i);n.innerHTML=`
    <h2>${r==="forest"?"🌳 森陣営の勝利！":"🐺 おおかみ陣営の勝利！"}</h2>
    ${_n(e)}
    <p class="hint-text">${i.length>0?`脱落したのは ${i.map(c=>{var d;return Di(((d=e.members[c])==null?void 0:d.name)??"?")}).join("、")}`:"誰も脱落しませんでした"}</p>

    <h3>みんなの最終役職</h3>
    <ul class="member-list result-list">
      ${t.map(c=>{const d=c.currentRole,u=d?C[d]:void 0;return`<li class="${o.has(c.id)?"eliminated":""}">
            ${Di(c.name)}
            — ${u?`${u.emoji} ${u.name}`:"?"}
            <span class="vote-count">(${s[c.id]??0}票)</span>
          </li>`}).join("")}
    </ul>

    ${co(e)?'<button id="btn-play-again" class="btn-primary">もう一度あそぶ</button>':'<p class="waiting-text">ホストが「もう一度あそぶ」を押すのを待っています…</p>'}
    <button id="btn-leave-room" class="btn-link">トップに戻る</button>
  `,(a=n.querySelector("#btn-play-again"))==null||a.addEventListener("click",()=>{od(e.roomId)}),(l=n.querySelector("#btn-leave-room"))==null||l.addEventListener("click",()=>{e.requestLeaveRoom()})}function Di(n){const e=document.createElement("div");return e.textContent=n,e.innerHTML}const Qt="mori-no-yakai-session";async function yd(){try{if((await(await fetch("version.json?t="+Date.now())).json()).version!=="0.1.13"){const t=await caches.keys();await Promise.all(t.map(i=>caches.delete(i)));const s=await navigator.serviceWorker.getRegistration();s&&await s.unregister(),window.location.reload()}}catch{}}let H=null,K=null,oe=null,Xt={},Me=null,at=[],Dt=null;function mo(){return{home:document.getElementById("screen-home"),lobby:document.getElementById("screen-lobby"),night:document.getElementById("screen-night"),discuss:document.getElementById("screen-discuss"),vote:document.getElementById("screen-vote"),result:document.getElementById("screen-result")}}function go(n){const e=mo();for(const t of Object.keys(e))e[t].classList.toggle("active",t===n)}async function Pi(n,e){const t=document.getElementById("home-error");if(t.textContent="",!e.trim()){t.textContent="なまえを入力してください";return}const s=Uh();try{await ao(n,s,e.trim())}catch{t.textContent="入室に失敗しました。部屋コードを確認してください。";return}H=n,K=s,localStorage.setItem(Qt,JSON.stringify({roomId:n,memberId:s,name:e.trim()})),vo()}function yo(){at.forEach(n=>n()),at=[],Dt!==null&&(clearInterval(Dt),Dt=null)}function vo(){if(!H||!K)return;const n=H;yo(),at.push(Vh(n,e=>{oe=e,kt()})),at.push(Gh(n,e=>{Xt=e,kt()})),at.push(qh(n,e=>{Me=e,kt()})),Dt=setInterval(()=>{H&&ed(H),kt()},1e3)}function kn(){H&&K&&Hh(H,K)}function vd(){H&&K&&jh(H,K),yo(),H=null,K=null,oe=null,Xt={},Me=null,localStorage.removeItem(Qt),go("home")}function kt(){if(!oe||!H||!K||!Xt[K])return;const n=(Me==null?void 0:Me.round)===oe.roundNumber?Me.cards:[],e={roomId:H,memberId:K,state:oe,members:Xt,centerCards:n,requestLeaveRoom:vd};go(oe.phase);const t=mo()[oe.phase];switch(oe.phase){case"lobby":ad(t,e);break;case"night":ee(t,e);break;case"discuss":_o(t,e);break;case"vote":_d(t,e);break;case"result":gd(t,e);break}}function bd(){var e,t;(e=document.getElementById("btn-create-room"))==null||e.addEventListener("click",()=>{const s=document.getElementById("input-name").value;Pi(Wh(),s)}),(t=document.getElementById("btn-join-room"))==null||t.addEventListener("click",()=>{const s=document.getElementById("input-name").value,i=document.getElementById("input-room-code").value.trim().toUpperCase();if(!i){document.getElementById("home-error").textContent="部屋コードを入力してください";return}Pi(i,s)}),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&kn()}),window.addEventListener("pageshow",kn),window.addEventListener("online",kn);const n=localStorage.getItem(Qt);if(n)try{const s=JSON.parse(n);document.getElementById("input-name").value=s.name??"",s.roomId&&s.memberId&&(H=s.roomId,K=s.memberId,ao(s.roomId,s.memberId,s.name).then(()=>{vo()}))}catch{localStorage.removeItem(Qt)}}bd();yd();
