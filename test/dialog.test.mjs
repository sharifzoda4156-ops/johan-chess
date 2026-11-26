import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmDialog,hasOpenDialog,closeOpenDialog} from '../public/dialog.js';

function fakeDom(){
  const listeners=new Map();
  let active=null;
  function makeEl(tag){
    const el={
      tagName:tag.toUpperCase(),
      className:'',
      id:'',
      textContent:'',
      dataset:{},
      attrs:{},
      children:[],
      parent:null,
      isConnected:false,
      setAttribute(k,v){this.attrs[k]=String(v);},
      getAttribute(k){return this.attrs[k]??null;},
      append(...nodes){for(const n of nodes){n.parent=this;n.isConnected=this.isConnected;markConnected(n,this.isConnected);this.children.push(n);}},
      remove(){if(this.parent){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);this.parent=null;}markConnected(this,false);},
      focus(){active=this;}
    };
    return el;
  }
  function markConnected(el,val){el.isConnected=val;for(const c of el.children)markConnected(c,val);}
  const body=makeEl('body');body.isConnected=true;
  const doc={
    body,
    get activeElement(){return active;},
    createElement:makeEl,
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    dispatchKey(key){for(const fn of [...(listeners.get('keydown')||[])])fn({key,preventDefault(){},stopPropagation(){}});}
  };
  return doc;
}

test('confirmDialog resolves true on confirm and cleans up DOM',async()=>{
  const doc=fakeDom();
  const promise=confirmDialog({title:'Сдаться?',message:'Завершить партию?',confirmText:'Сдаться',danger:true,doc});
  assert.equal(hasOpenDialog(),true);
  assert.equal(doc.body.children.length,1);
  const backdrop=doc.body.children[0];
  const card=backdrop.children[0];
  assert.equal(card.getAttribute('role'),'dialog');
  assert.equal(card.getAttribute('aria-modal'),'true');
  const [cancelBtn,okBtn]=card.children[2].children;
  assert.equal(doc.activeElement,cancelBtn,'danger dialogs default focus to cancel');
  okBtn.onclick();
  assert.equal(await promise,true);
  assert.equal(hasOpenDialog(),false);
  assert.equal(doc.body.children.length,0);
});

test('confirmDialog resolves false on Escape and closeOpenDialog',async()=>{
  const doc=fakeDom();
  const p1=confirmDialog({title:'Test',message:'Msg',doc});
  doc.dispatchKey('Escape');
  assert.equal(await p1,false);
  const p2=confirmDialog({title:'Test 2',message:'Msg',doc});
  assert.equal(hasOpenDialog(),true);
  closeOpenDialog();
  assert.equal(await p2,false);
  assert.equal(hasOpenDialog(),false);
});
