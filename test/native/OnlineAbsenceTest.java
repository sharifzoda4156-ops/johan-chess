package com.johansystems.chess;
public final class OnlineAbsenceTest {
    static void check(boolean b){if(!b)throw new AssertionError();}
    public static void main(String[] args){
        OnlineAbsence g=new OnlineAbsence();
        g.update("game0001",true,1000);check(g.remaining(1000)==-1);
        g.update("game0001",false,2000);check(g.remaining(2000)==60000);
        g.update("game0001",false,30000);check(g.remaining(30000)==32000);
        g.update("game0001",true,61999);check(!g.expired()&&g.remaining(61999)==-1);
        g.update("game0001",false,70000);g.update("game0001",true,130000);check(g.expired());
        g.update("game0001",true,140000);check(g.expired()&&g.remaining(140000)==0);
        OnlineAbsence restored=new OnlineAbsence();restored.restore(g.game(),g.deadline(),g.expired());restored.update("game0001",true,140001);check(restored.expired());
        restored.update("",false,140002);check(!restored.expired()&&restored.remaining(140002)==-1);
        g.update("game0002",false,150000);check(!g.expired()&&g.remaining(150000)==60000);
        restored.restore("game0002",210000,false);restored.update("game0002",true,210001);check(restored.expired());
        System.out.println("Online absence tests passed");
    }
}
