// Styled in-app confirmation modal replacing window.confirm() across web and Android WebView.
let activeCloser=null;

export function hasOpenDialog(){
  return activeCloser!==null;
}

export function closeOpenDialog(){
  if(activeCloser)activeCloser(false);
}

export function confirmDialog({
  title='Подтверждение',
  message='',
  confirmText='Подтвердить',
  cancelText='Отмена',
  danger=false,
  doc=globalThis.document
}={}){
  if(!doc||!doc.body)return Promise.resolve(false);
  if(activeCloser)activeCloser(false);

  return new Promise(resolve=>{
    const prevFocus=doc.activeElement;
    const backdrop=doc.createElement('div');
    backdrop.className='jc-modal-backdrop';
    backdrop.dataset.dialog='confirm';

    const card=doc.createElement('div');
    card.className='jc-modal-card';
    card.setAttribute('role','dialog');
    card.setAttribute('aria-modal','true');
    const titleId='jc-dialog-title-'+Math.random().toString(36).slice(2,8);
    card.setAttribute('aria-labelledby',titleId);

    const heading=doc.createElement('h3');
    heading.id=titleId;
    heading.className='jc-modal-title';
    heading.textContent=title;

    const body=doc.createElement('p');
    body.className='jc-modal-body';
    body.textContent=message;

    const actions=doc.createElement('div');
    actions.className='jc-modal-actions';

    const cancelBtn=doc.createElement('button');
    cancelBtn.type='button';
    cancelBtn.className='jc-modal-cancel';
    cancelBtn.dataset.dialogAction='cancel';
    cancelBtn.textContent=cancelText;

    const okBtn=doc.createElement('button');
    okBtn.type='button';
    okBtn.className=danger?'jc-modal-confirm danger':'jc-modal-confirm primary';
    okBtn.dataset.dialogAction='confirm';
    okBtn.textContent=confirmText;

    actions.append(cancelBtn,okBtn);
    card.append(heading,body,actions);
    backdrop.append(card);

    let settled=false;
    function finish(value){
      if(settled)return;
      settled=true;
      if(activeCloser===finish)activeCloser=null;
      doc.removeEventListener('keydown',onKeyDown,true);
      backdrop.remove();
      if(prevFocus&&typeof prevFocus.focus==='function'&&prevFocus.isConnected)prevFocus.focus();
      resolve(value);
    }

    function onKeyDown(e){
      if(e.key==='Escape'){
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }else if(e.key==='Tab'){
        const focusables=[cancelBtn,okBtn];
        const idx=focusables.indexOf(doc.activeElement);
        e.preventDefault();
        const next=e.shiftKey?(idx<=0?focusables.length-1:idx-1):(idx+1)%focusables.length;
        focusables[next].focus();
      }
    }

    cancelBtn.onclick=()=>finish(false);
    okBtn.onclick=()=>finish(true);
    backdrop.onclick=e=>{if(e.target===backdrop)finish(false);};

    activeCloser=finish;
    doc.addEventListener('keydown',onKeyDown,true);
    doc.body.append(backdrop);
    (danger?cancelBtn:okBtn).focus();
  });
}
