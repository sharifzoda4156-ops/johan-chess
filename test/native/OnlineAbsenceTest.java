package com.johansystems.chess;
public final class OnlineAbsenceTest {
    private static void check(boolean ok){if(!ok)throw new AssertionError("Absence policy failed");}
    public static void main(String[] args){
        OnlineAbsence a=new OnlineAbsence();
        a.update(100,true,false);check(a.remaining(100)==-1);
        a.update(1000,true,true);check(a.remaining(1000)==60000);
        a.update(60999,true,false);check(!a.pending()&&a.remaining(60999)==-1);
        a.update(70000,true,true);a.update(130000,true,false);check(a.pending()&&a.remaining(130000)==0);
        a.update(140000,true,false);check(a.pending());a.update(140001,false,false);check(!a.pending());
        a.restore(10,20000,false);a.update(20009,true,true);check(!a.pending());a.update(20010,true,false);check(a.pending());
        a.restore(500,0,true);check(a.pending());a.reset();a.forfeit();check(a.pending());a.update(501,true,false);check(a.pending());
        a.reset();a.update(1000,false,true);check(a.remaining(1000)==-1);
        System.out.println("Online absence policy OK");
    }
}
