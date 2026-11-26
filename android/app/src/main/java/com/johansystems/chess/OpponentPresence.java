package com.johansystems.chess;
final class OpponentPresence {
    private boolean gone=false;
    private long claimAt=-1;
    void reset(){gone=false;claimAt=-1;}
    void update(boolean absent,Integer seconds,long now){gone=absent;claimAt=absent&&seconds!=null&&seconds>=0?now+1000L*seconds:-1;}
    boolean gone(){return gone;}
    long remaining(long now){return gone&&claimAt>=0?Math.max(0,claimAt-now):-1;}
    boolean canClaim(long now){return gone&&claimAt>=0&&now>=claimAt;}
}
