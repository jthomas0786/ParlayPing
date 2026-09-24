self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={body:event.data?.text?.()||''};}
  const title=data.title||'ParlayPing Tracking';
  const options={
    body:data.body||'Your tracked parlay has an update.',
    icon:data.icon||'/parlayping-approved-logo.png',
    badge:data.badge||'/parlayping-approved-logo.png',
    tag:data.tag||'parlayping-tracking',
    renotify:true,
    data:{url:data.url||'/profile?tab=tracking',trackId:data.trackId||null}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification?.data?.url||'/profile?tab=tracking',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus' in client){await client.navigate(target).catch(()=>{});return client.focus();}
    }
    return clients.openWindow(target);
  })());
});
