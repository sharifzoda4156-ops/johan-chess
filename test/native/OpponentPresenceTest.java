package com.johansystems.chess;
public final class OpponentPresenceTest {
    private static void check(boolean ok){if(!ok)throw new AssertionError("Opponent presence policy failed");}
    public static void main(String[] args){
        OpponentPresence p=new OpponentPresence();
        check(!p.gone()&&!p.canClaim(100000));
        p.update(true,120,1000);check(p.gone()&&p.remaining(1000)==120000);
        check(!p.canClaim(120999)&&p.canClaim(121000));
        p.update(false,null,121001);check(!p.gone()&&!p.canClaim(999999));
        p.update(true,null,2000);check(p.gone()&&p.remaining(999999)==-1&&!p.canClaim(999999));
        p.update(true,0,3000);check(p.canClaim(3000));
        p.reset();check(!p.canClaim(4000));
        p.update(true,-1,3000);check(!p.canClaim(999999));
        p.update(true,30,3000);p.update(true,90,4000);check(!p.canClaim(33000)&&p.canClaim(94000));
        System.out.println("Opponent presence policy OK");
    }
}
