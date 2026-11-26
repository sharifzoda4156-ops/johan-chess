package com.johansystems.chess;

// Pure elapsed-time policy, independent of Activity, WebView and network.
final class OnlineAbsence {
    static final long GRACE_MS=60_000L;
    private long deadline=-1;
    private boolean due=false;
    void reset(){deadline=-1;due=false;}
    void restore(long now,long remaining,boolean pending){
        reset();
        if(pending){due=true;return;}
        if(remaining>=0){deadline=now+Math.min(GRACE_MS,remaining);if(remaining==0)due=true;}
    }
    void update(long now,boolean active,boolean absent){
        if(!active){reset();return;}
        // Expiry wins over a late reconnection. Once due, no return cancels it.
        if(deadline>=0&&now>=deadline)due=true;
        if(due)return;
        if(absent){if(deadline<0)deadline=now+GRACE_MS;}
        else deadline=-1;
    }
    void forfeit(){due=true;}
    boolean pending(){return due;}
    long remaining(long now){return due?0:deadline<0?-1:Math.max(0,deadline-now);}
}
