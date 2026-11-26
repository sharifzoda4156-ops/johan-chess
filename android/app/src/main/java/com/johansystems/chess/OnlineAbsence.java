package com.johansystems.chess;

/** Pure state machine; caller supplies a monotonic epoch clock and persists deadline. */
final class OnlineAbsence {
    static final long LIMIT=60000L;
    private String game="";
    private long deadline=0;
    private boolean expired=false;
    void restore(String id,long savedDeadline,boolean due){
        game=id;deadline=Math.max(0,savedDeadline);expired=due&&!id.isEmpty();
    }
    void update(String id,boolean healthy,long now){
        if(!game.equals(id)){game=id;deadline=0;expired=false;}
        if(id.isEmpty()){deadline=0;expired=false;return;}
        // Returning at/after the deadline never erases a committed forfeit.
        if(deadline>0&&now>=deadline)expired=true;
        if(expired)return;
        if(healthy)deadline=0;
        else if(deadline==0)deadline=now+LIMIT;
    }
    String game(){return game;}
    long deadline(){return deadline;}
    boolean expired(){return expired;}
    long remaining(long now){return expired?0:deadline==0?-1:Math.max(0,deadline-now);}
}
