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

  /* completed-orders history (localStorage, newest first, capped) */
  function orders(){return load('sina_orders',[]);}
  function pushOrder(o){var a=load('sina_orders',[]);a.unshift(o);if(a.length>50)a.length=50;save('sina_orders',a);return a;}
  /* orders registered with the signed-in phone (legacy orders without uphone stay visible on the same device) */
  function myOrders(){
    var u=load('sina_user',null);var a=orders();
    if(!u||!u.phone)return a;
    return a.filter(function(o){return !o.uphone||o.uphone===u.phone||o.phone===u.phone;});
  }

  /* ---- per-phone cart: survives logout / re-login ---- */
  function uCartKey(p){return 'sina_cart_u_'+(p||'');}
  function rebind(items){cart.length=0;items.forEach(function(x){cart.push(x);});cartSave();}
  function mergeCarts(base,extra){
    var m=(base||[]).map(function(x){return {id:x.id,qty:x.qty,color:x.color};});
    (extra||[]).forEach(function(it){
      for(var i=0;i<m.length;i++){if(m[i].id===it.id&&(m[i].color||'')===(it.color||'')){m[i].qty=Math.min(99,m[i].qty+it.qty);return;}}
      m.push({id:it.id,qty:it.qty,color:it.color||''});
    });
    return m;
  }
  /* sign-in: restore this phone's stashed cart (merging anything added anonymously) */
  function userLogin(sess){
    if(!sess)return sess;
    try{
      if(sess.phone){
        var key=uCartKey(sess.phone),saved=load(key,null);
        rebind(mergeCarts(saved,cart));
        save(key,cart);
      }
    }catch(e){}
    save('sina_user',sess);badge();
    return sess;
  }
  /* sign-out: stash the cart under the phone so the next login brings it back */
  function userLogout(){
    var u=load('sina_user',null);
    try{
      if(u&&u.phone)save(uCartKey(u.phone),cart);
      localStorage.removeItem('sina_user');
    }catch(e){}
    rebind([]);
    return u;
  }

  /* ---- cloud order history (Supabase RPC get_orders_by_phone, anon-safe security-definer fn) ---- */
  var SUPA=window.SB_SUPA||{url:'https://pcjmzutugtsqaqubcwmt.supabase.co',key:'sb_publishable_bW59Dhz3PsDB2Hv2wgZRRQ_KhuhRygm'};
  function rowToLocal(r){
    var d=null;try{d=new Date(String(r.created_at||'').replace(' ','T'));}catch(e){}
    return {code:r.order_code||'',date:(d&&!isNaN(d.getTime()))?jdate(d):'',
      name:r.customer_name||'',phone:r.phone||'',uphone:r.phone||'',
      prv:r.province||'',city:r.city||'',addr:r.address||'',zip:'',note:r.note||'',
      items:Array.isArray(r.items)?r.items:[],
      sub:r.subtotal||0,disc:0,shipCost:r.shipping||0,
      pay:{name:'ثبت‌شده در سایت'},ship:{name:'ارسال با هماهنگی تولیدی'},
      total:r.total||0,status:r.status||'pending',cloud:true};
  }
  function orderTs(o){
    var t=String(o&&o.date||'').replace(/[۰-۹]/g,function(d){return String(PALN.indexOf(d));}).split('/').join('');
    var n=parseInt(t,10);return isNaN(n)?0:n;
  }
  /* pull this phone's orders from Supabase, merge into local history (dedupe by order code) */
  function syncOrders(cb){
    var u=load('sina_user',null);
    if(!u||!u.phone||!SUPA.url){if(cb)cb(orders());return;}
    try{
      fetch(SUPA.url+'/rest/v1/rpc/get_orders_by_phone',{
        method:'POST',
        headers:{'apikey':SUPA.key,'Content-Type':'application/json'},
        body:JSON.stringify({p_phone:u.phone})
      }).then(function(r){return r.ok?r.json():[];}).then(function(list){
        if(Array.isArray(list)&&list.length){
          var a=orders(),seen={},i;
          for(i=0;i<a.length;i++)if(a[i].code)seen[a[i].code]=1;
          for(i=0;i<list.length;i++){
            var o=rowToLocal(list[i]);
            if(o.code&&!seen[o.code]){a.push(o);seen[o.code]=1;}
          }
          a.sort(function(x,y){return orderTs(y)-orderTs(x);});
          if(a.length>100)a.length=100;
          save('sina_orders',a);
        }
        if(cb)cb(orders());
      }).catch(function(){if(cb)cb(orders());});
    }catch(e){if(cb)cb(orders());}
  }

  /* standalone printable invoice window (RTL, webfont) — shared by success + account pages */
  function printInvoice(o){
    var w=window.open('','_blank');
    if(!w){toast('برای چاپ، اجازهٔ باز شدن پنجره را به سایت بدهید.');return;}
    function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    var rows='';
    (o.items||[]).forEach(function(it){rows+='<tr><td>'+esc(it.name)+(it.color?' — '+esc(it.color):'')+'</td><td class="c">'+fa(it.qty)+'</td><td class="c">'+money(it.price)+'</td><td class="c">'+money(it.price*it.qty)+'</td></tr>';});
    var logo=document.querySelector('.lk svg');
    var base=location.protocol==='file:'?'.':location.origin;
    var h='<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>فاکتور فروش '+esc(o.code)+' — تولیدی کیف سینا</title><style>'
      +'@font-face{font-family:"Vazirmatn";font-style:normal;font-weight:400;src:url("'+base+'/fonts/Vazirmatn-Regular.woff2") format("woff2");}'
      +'@font-face{font-family:"Vazirmatn";font-style:normal;font-weight:700;src:url("'+base+'/fonts/Vazirmatn-Bold.woff2") format("woff2");}'
      +'*{margin:0;padding:0;box-sizing:border-box}'
      +'body{font-family:"Vazirmatn",Tahoma,sans-serif;direction:rtl;color:#2B2118;padding:36px 40px;font-size:13px}'
      +'.ph{display:flex;align-items:center;gap:14px;border-bottom:3px solid #9C5B2E;padding-bottom:16px}'
      +'.tt{flex:1}.tt h1{font-size:20px;color:#9C5B2E}.tt span{font-size:11px;color:#8A7660}'
      +'.meta{text-align:left;font-size:11.5px;line-height:2}.meta b{font-weight:700}'
      +'.grid2{display:flex;gap:14px;margin:18px 0}'
      +'.box{flex:1;border:1px solid #E0D5C0;border-radius:8px;padding:12px 14px;line-height:2.1;font-size:12px}'
      +'.box h3{font-size:12.5px;color:#9C5B2E;margin-bottom:6px}'
      +'table{width:100%;border-collapse:collapse;margin-top:6px}'
      +'th{background:#F3EDE2;font-size:12px;padding:8px 10px;border:1px solid #E0D5C0}'
      +'td{padding:8px 10px;border:1px solid #E8DFCC;font-size:12px}'
      +'td.c{text-align:center;white-space:nowrap}'
      +'.sums{margin-top:14px;display:flex;justify-content:flex-end}'
      +'.sums table{width:340px}'
      +'.sums td{border:none;padding:5px 10px;font-size:12.5px}'
      +'.tot td{border-top:2px solid #9C5B2E;font-weight:700;font-size:14px;color:#9C5B2E}'
      +'.fnote{margin-top:22px;font-size:11px;color:#8A7660;line-height:2;border-top:1px dashed #E0D5C0;padding-top:12px}'
      +'</style></head><body>'
      +'<div class="ph"><div style="width:56px">'+(logo?logo.outerHTML:'')+'</div><div class="tt"><h1>تولیدی کیف سینا</h1><span>کیف پارچه‌ای، کوله‌پشتی و کیف پلاستیکی — اصفهان، شهرک صنعتی | ۰۳۱-۳۳۳۳۴۴۵۵</span></div>'
      +'<div class="meta"><b>فاکتور فروش</b><br>شمارهٔ سفارش: <b>'+esc(o.code)+'</b><br>تاریخ: '+esc(o.date)+'</div></div>'
      +'<div class="grid2"><div class="box"><h3>مشخصات گیرنده</h3>نام: '+esc(o.name)+'<br>تلفن: '+esc(o.phone)+'<br>آدرس: '+esc(o.prv)+'، '+esc(o.city)+' — '+esc(o.addr)+(o.zip?'<br>کد پستی: '+esc(o.zip):'')+'</div>'
      +'<div class="box"><h3>شرایط سفارش</h3>روش پرداخت: '+esc(o.pay&&o.pay.name)+'<br>روش ارسال: '+esc(o.ship&&o.ship.name)+' — '+((o.shipCost)?money(o.shipCost)+' تومان':'رایگان')+(o.note?'<br>یادداشت: '+esc(o.note):'')+'</div></div>'
      +'<table><tr><th>کالا</th><th style="width:70px">تعداد</th><th style="width:130px">قیمت واحد (تومان)</th><th style="width:130px">مبلغ کل (تومان)</th></tr>'+rows+'</table>'
      +'<div class="sums"><table>'
      +'<tr><td>جمع کالاها</td><td class="c">'+money(o.sub||0)+' تومان</td></tr>'
      +((o.disc)?'<tr><td>تخفیف'+(o.promo?' ('+esc(o.promo)+')':'')+'</td><td class="c">−'+money(o.disc)+' تومان</td></tr>':'')
      +'<tr><td>هزینهٔ ارسال</td><td class="c">'+((o.shipCost)?money(o.shipCost)+' تومان':'رایگان')+'</td></tr>'
      +'<tr class="tot"><td>مبلغ نهایی</td><td class="c">'+money(o.total||0)+' تومان</td></tr>'
      +'</table></div>'
      +'<div class="fnote">• این فاکتور پیش‌نمایش سفارش است؛ فاکتور رسمی با مالیات بر ارزش افزوده همراه کالا ارسال می‌شود.<br>• سفارش شما وارد صف دوخت تولیدی شد — برای هماهنگی با شما تماس گرفته می‌شود.<br>• تولیدی کیف سینا — sinabag.vercel.app</div>'
      +'</body></html>';
    w.document.write(h);w.document.close();
    var pr=function(){try{w.focus();w.print();}catch(e){}};
    if(w.document.fonts&&w.document.fonts.ready){w.document.fonts.ready.then(function(){setTimeout(pr,300);});}
    else{setTimeout(pr,800);}
  }

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
    promo:promo,setPromo:setPromo,discount:discount,orders:orders,myOrders:myOrders,pushOrder:pushOrder,printInvoice:printInvoice,
    userLogin:userLogin,userLogout:userLogout,syncOrders:syncOrders,
    user:function(){return load('sina_user',null);}};

  function bindCommon(){
    badge();
    /* when logged in, profile buttons go to the account page instead of login */
    var u=load('sina_user',null);
    if(u){
      document.querySelectorAll('.ic a.b[href="login.html"]').forEach(function(a){a.setAttribute('href','account.html');a.setAttribute('title','حساب کاربری');a.setAttribute('aria-label','حساب کاربری');});
      document.querySelectorAll('.mnav a[href="login.html"]').forEach(function(a){a.textContent='حساب کاربری';a.setAttribute('href','account.html');});
    }
    document.querySelectorAll('[data-toast]').forEach(function(b){
      if(b.__sbT)return;b.__sbT=1;
      b.addEventListener('click',function(e){if(b.tagName==='A')e.preventDefault();toast(b.getAttribute('data-toast'));});
    });
  }
  if(document.readyState!=='loading')bindCommon();
  else document.addEventListener('DOMContentLoaded',bindCommon);
})();
