/* SinaBag shared app: cart store (localStorage), header badge, toast, utils */
(function(){
  var PALN='۰۱۲۳۴۵۶۷۸۹';
  function fa(n){return String(n).replace(/[0-9]/g,function(d){return PALN[+d];});}
  function toEn(s){return String(s||'').replace(/[۰-۹]/g,function(d){return String(PALN.indexOf(d));});}
  function money(n){return fa(Math.round(n).toLocaleString('en-US')).replace(/,/g,'٬');}
  function byId(id){var a=window.SB_PRODUCTS||[];for(var i=0;i<a.length;i++){if(a[i].id===id)return a[i];}return null;}
  function load(k,d){try{var v=JSON.parse(localStorage.getItem(k));return (v===null||v===undefined)?d:v;}catch(e){return d;}}
  function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

  var cart=load('sina_cart',[]);
  function badge(){
    var b=document.getElementById('cartBadge');if(!b)return;
    var n=0;cart.forEach(function(i){n+=i.qty;});
    b.textContent=n?fa(n):'';
  }
  function cartSave(){save('sina_cart',cart);badge();}
  function add(id,qty,color){
    var p=byId(id);if(!p)return false;
    qty=Math.max(1,qty||1);color=color||'';
    for(var i=0;i<cart.length;i++){if(cart[i].id===id&&cart[i].color===color){cart[i].qty=Math.min(99,cart[i].qty+qty);cartSave();return true;}}
    cart.push({id:id,qty:qty,color:color});cartSave();return true;
  }
  function setQty(i,q){if(cart[i]){cart[i].qty=Math.max(1,Math.min(99,q));cartSave();}}
  function remove(i){if(cart[i]){cart.splice(i,1);cartSave();}}
  function clear(){cart.length=0;cartSave();}
  function count(){var n=0;cart.forEach(function(i){n+=i.qty;});return n;}
  function subtotal(){var s=0;cart.forEach(function(i){var p=byId(i.id);if(p)s+=p.price*i.qty;});return s;}
  function promo(){return load('sina_promo','');}
  function setPromo(c){save('sina_promo',c||'');}
  function discount(sub){return promo()==='SINA10'?Math.round(sub*0.1):0;}

  function toast(m){
    var el=document.getElementById('toast');
    if(!el){el=document.createElement('div');el.className='toast';el.id='toast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el);}
    el.textContent=m;el.classList.add('on');
    clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('on');},2800);
  }

  function jdate(d){
    d=d||new Date();
    var gy=d.getFullYear(),gm=d.getMonth()+1,gd=d.getDate();
    var GDM=[0,31,59,90,120,151,181,212,243,273,304,334];
    var jy=(gy<=1600)?0:979;gy-=(gy<=1600)?621:1600;
    var gy2=(gm>2)?(gy+1):gy;
    var days=(365*gy)+Math.floor((gy2+3)/4)-Math.floor((gy2+99)/100)+Math.floor((gy2+399)/400)-80+gd+GDM[gm-1];
    jy+=33*Math.floor(days/12053);days%=12053;
    jy+=4*Math.floor(days/1461);days%=1461;
    if(days>365){jy+=Math.floor((days-1)/365);days=(days-1)%365;}
    var jm=(days<186)?1+Math.floor(days/31):7+Math.floor((days-186)/30);
    var jd=1+((days<186)?(days%31):((days-186)%30));
    return fa(jy)+'/'+fa(('0'+jm).slice(-2))+'/'+fa(('0'+jd).slice(-2));
  }

  window.SB={fa:fa,toEn:toEn,money:money,byId:byId,load:load,save:save,toast:toast,jdate:jdate,
    cart:cart,add:add,setQty:setQty,remove:remove,clear:clear,count:count,subtotal:subtotal,
    promo:promo,setPromo:setPromo,discount:discount,
    user:function(){return load('sina_user',null);}};

  function bindCommon(){
    badge();
    document.querySelectorAll('[data-toast]').forEach(function(b){
      if(b.__sbT)return;b.__sbT=1;
      b.addEventListener('click',function(e){if(b.tagName==='A')e.preventDefault();toast(b.getAttribute('data-toast'));});
    });
  }
  if(document.readyState!=='loading')bindCommon();
  else document.addEventListener('DOMContentLoaded',bindCommon);
})();
