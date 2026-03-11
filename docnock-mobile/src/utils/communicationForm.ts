import { showMessage } from 'react-native-flash-message';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import { devLogger } from './helpers';

export const CommunicationFormHTML = `<div _ngcontent-ng-c4264948157="" class="modal-body"><div _ngcontent-ng-c4264948157=""><p _ngcontent-ng-c4264948157=""><strong _ngcontent-ng-c4264948157="">1. Patient Info</strong></p><label _ngcontent-ng-c4264948157="">Name: <input _ngcontent-ng-c4264948157="" type="text" style="width: 200px;" id="name"></label><label _ngcontent-ng-c4264948157="" style="margin-left: 20px;">Room #:<input _ngcontent-ng-c4264948157="" type="text" style="width: 100px;" id="room"></label><label _ngcontent-ng-c4264948157="" style="margin-left: 20px;">DOB: <input _ngcontent-ng-c4264948157="" type="text" style="width: 150px;"  id="dob"></label></div><div _ngcontent-ng-c4264948157="" style="text-align: left;"><p _ngcontent-ng-c4264948157=""><strong _ngcontent-ng-c4264948157="">2. Reason for Message</strong></p><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox" id="checkbox_changeInCondition"> Change in condition</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox"  id="checkbox_abnormalVitalSigns"> Abnormal vital signs</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox"  id="checkbox_pain"> Pain</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox"  id="checkbox_fall"> Fall</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox"  id="checkbox_newSymptom"> New symptom</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox"  id="checkbox_woundIssue"> Wound issue</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox"  id="checkbox_medicationRelated"> Medication-related</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox"  id="checkbox_labResultConcern"> Lab/result concern</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox"  id="checkbox_otherReason"> Other: <input _ngcontent-ng-c4264948157="" type="text" style="width: 200px;" id="otherReasonString"></label></div><div _ngcontent-ng-c4264948157=""><p _ngcontent-ng-c4264948157=""><strong _ngcontent-ng-c4264948157="">3. Summary of Concern</strong></p><textarea _ngcontent-ng-c4264948157="" style="width: 100%; height: 80px;" id="summaryOfConcern"></textarea></div><div _ngcontent-ng-c4264948157=""><p _ngcontent-ng-c4264948157=""><strong _ngcontent-ng-c4264948157="">4. Most Recent Vital Signs (if applicable)</strong></p><label _ngcontent-ng-c4264948157="">BP: <input _ngcontent-ng-c4264948157="" type="text" style="width: 80px;" id="bp"> mmHg</label><label _ngcontent-ng-c4264948157="" style="margin-left: 20px;">HR: <input _ngcontent-ng-c4264948157="" type="text" style="width: 80px;" id="hr">bpm</label><label _ngcontent-ng-c4264948157="" style="margin-left: 20px;">RR: <input _ngcontent-ng-c4264948157="" type="text" style="width: 80px;" id="rr"></label><br _ngcontent-ng-c4264948157=""><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157="">Temp:<input _ngcontent-ng-c4264948157="" type="text" style="width: 80px;" id="temp"> °F</label><label _ngcontent-ng-c4264948157="" style="margin-left: 20px;">SpO₂: <input _ngcontent-ng-c4264948157="" type="text" style="width: 80px;" id="spo2"> % on <input _ngcontent-ng-c4264948157="" type="text" style="width: 80px;" id="o2"> L/min O₂</label></div><div _ngcontent-ng-c4264948157=""><p _ngcontent-ng-c4264948157=""><strong _ngcontent-ng-c4264948157="">5. Actions Already Taken:</strong></p><input _ngcontent-ng-c4264948157="" type="text" style="width: 100%;" id="actionAlreadyTaken"></div><div _ngcontent-ng-c4264948157=""><p _ngcontent-ng-c4264948157=""><strong _ngcontent-ng-c4264948157="">6. Requested Action from Provider</strong></p><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox" id="checkbox_provideOrders"> Provide orders</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox" id="checkbox_reviewLabsResults"> Review labs/results</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox" id="checkbox_callBack"> Call back</label><br _ngcontent-ng-c4264948157=""><label _ngcontent-ng-c4264948157=""><input _ngcontent-ng-c4264948157="" type="checkbox" id="checkbox_other"> Other: <input _ngcontent-ng-c4264948157="" type="text" style="width: 200px;" id="otherActionString"></label></div><div _ngcontent-ng-c4264948157=""><p _ngcontent-ng-c4264948157=""><strong _ngcontent-ng-c4264948157="">7. Provider Response</strong></p><textarea _ngcontent-ng-c4264948157="" style="width: 100%; height: 80px;" id="providerResponse"></textarea></div></div>`;

export const getPDF = async (html = CommunicationFormHTML) => {
  try {
    const options = {
      html,
      fileName: 'generated_pdf',
      directory: 'Documents',
    };

    const file = await RNHTMLtoPDF.convert(options);

    if (file.filePath) {
      return file.filePath;
    }
  } catch (error) {
    devLogger('Error generating PDF:', error);
    showMessage({
      type: 'danger',
      message: 'Error',
      description: 'Failed to generate PDF',
    });
    return false;
  }
};
