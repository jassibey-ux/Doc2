import { StyleSheet } from 'react-native';

export const commonStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexGrow: {
    flexGrow: 1,
  },
  flexItemCenter: {
    flex: 1,
    alignItems: 'center',
  },
  center: {
    alignSelf: 'center',
  },
  itemCenter: {
    alignItems: 'center',
  },
  justifyCenter: {
    justifyContent: 'center',
  },
  justifyStart: {
    justifyContent: 'flex-start',
  },
  justifyEnd: {
    justifyContent: 'flex-end',
  },
  centerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  rowItemsCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowItemsEnd: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  rowJustifyEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  rowItemCenterJustifyCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowItemCenterJustifyAround: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  rowItemCenterJustifyEvenly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  rowItemCenterJustifyBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowItemCenterJustifyStart: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  rowItemCenterJustifyEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  rowItemEndJustifyEnd: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  reverseRowItemCenterJustifyEnd: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
});
