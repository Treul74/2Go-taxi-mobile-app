import { Button, Card, Chip, Input } from '@/components/ui';
import { insforge } from '@/lib/insforge';
import { createDriverProfile } from '@/services/accounts';
import { uploadDriverDocument, type DriverDocumentType } from '@/services/uploads';
import { useAuthStore, useUserStore } from '@/state';
import type { VehicleType } from '@/types';
import type { OnboardingStep } from '@/features/driver/types';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Driver Onboarding Wizard
 * Step-based form: Personal Info -> Vehicle Info -> Documents -> Complete
 *
 * This flow is for logged-in customers becoming drivers. Eligibility is
 * checked against the drivers table ONLY — having a customers row with the
 * same email/phone is expected and never treated as a duplicate account.
 */
export function DriverOnboarding() {
  const {
    driverOnboarding,
    customerAccount,
    driverAccount,
    loadAccounts,
    setDriverAccount,
    setOnboardingStep,
    updatePersonalInfo,
    updateVehicleInfo,
    updateDocuments,
    completeOnboarding,
  } = useUserStore();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(driverOnboarding.currentStep);
  const [submitting, setSubmitting] = useState(false);

  // Personal info form state — name/email/phone pre-filled from the customer
  // profile since the user is already logged in.
  const [personalForm, setPersonalForm] = useState({
    firstName: driverOnboarding.personalInfo?.firstName || customerAccount?.firstName || '',
    lastName: driverOnboarding.personalInfo?.lastName || customerAccount?.lastName || '',
    email: driverOnboarding.personalInfo?.email || customerAccount?.email || '',
    phone: driverOnboarding.personalInfo?.phone || customerAccount?.phoneNumber || '',
    dateOfBirth: driverOnboarding.personalInfo?.dateOfBirth || '',
    nationalId: driverOnboarding.personalInfo?.nationalId || '',
    address: driverOnboarding.personalInfo?.address || '',
  });

  // Fetch fresh account rows when entering the flow (drivers-table check +
  // customer profile for pre-fill).
  React.useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Back-fill empty fields once the customer profile arrives, without
  // clobbering anything the user has already typed.
  React.useEffect(() => {
    if (!customerAccount) return;
    setPersonalForm((p) => ({
      ...p,
      firstName: p.firstName || customerAccount.firstName,
      lastName: p.lastName || customerAccount.lastName,
      email: p.email || customerAccount.email,
      phone: p.phone || customerAccount.phoneNumber,
    }));
  }, [customerAccount]);

  // Drivers-only duplicate guard: block re-entry when an application already
  // exists. (Skipped on the completion step so it doesn't fire on the row we
  // just created.)
  React.useEffect(() => {
    if (currentStep === 'complete' || !driverAccount) return;
    if (driverAccount.accountStatus === 'pending' || driverAccount.accountStatus === 'approved') {
      Alert.alert(
        'You already have a driver profile',
        driverAccount.accountStatus === 'approved'
          ? 'Your driver account is approved. Use "Switch Mode" in your Account settings to start driving.'
          : 'Your driver application is being reviewed. We\'ll notify you once it\'s approved.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  }, [driverAccount, currentStep]);
  
  // Vehicle info form state
  const [vehicleForm, setVehicleForm] = useState({
    make: driverOnboarding.vehicleInfo?.make || '',
    model: driverOnboarding.vehicleInfo?.model || '',
    year: driverOnboarding.vehicleInfo?.year || '',
    color: driverOnboarding.vehicleInfo?.color || '',
    plate: driverOnboarding.vehicleInfo?.plate || '',
    vehicleType: (driverOnboarding.vehicleInfo?.vehicleType || 'economy') as VehicleType,
  });
  
  // Documents state — each entry holds the uploaded file's storage url/key
  // (accumulated here, submitted with everything else at the end).
  const [documents, setDocuments] = useState(driverOnboarding.documents);
  const [uploadingDoc, setUploadingDoc] = useState<DriverDocumentType | null>(null);

  // Reuse the customer profile photo for the driver profile when one exists:
  // link its URL (key stays null — no duplicate upload) but let the user
  // replace it via the normal Change button.
  React.useEffect(() => {
    if (!customerAccount?.profilePhotoUrl) return;
    setDocuments((prev) =>
      prev.profilePhoto
        ? prev
        : { ...prev, profilePhoto: { url: customerAccount.profilePhotoUrl!, key: null } }
    );
  }, [customerAccount?.profilePhotoUrl]);
  
  // Step indicators
  const steps: { key: OnboardingStep; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'personal', label: 'Personal', icon: 'person' },
    { key: 'vehicle', label: 'Vehicle', icon: 'car' },
    { key: 'documents', label: 'Documents', icon: 'document-text' },
    { key: 'complete', label: 'Done', icon: 'checkmark-circle' },
  ];
  
  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);
  
  // Validation
  const validatePersonalInfo = () => {
    if (!personalForm.firstName.trim()) {
      Alert.alert('Required', 'Please enter your first name');
      return false;
    }
    if (!personalForm.lastName.trim()) {
      Alert.alert('Required', 'Please enter your last name');
      return false;
    }
    if (!EMAIL_REGEX.test(personalForm.email.trim())) {
      Alert.alert('Required', 'Please enter a valid email address');
      return false;
    }
    if (!personalForm.phone.trim()) {
      Alert.alert('Required', 'Please enter your phone number');
      return false;
    }
    if (!personalForm.dateOfBirth.trim()) {
      Alert.alert('Required', 'Please enter your date of birth');
      return false;
    }
    if (!personalForm.nationalId.trim()) {
      Alert.alert('Required', 'Please enter your national ID');
      return false;
    }
    if (!personalForm.address.trim()) {
      Alert.alert('Required', 'Please enter your address');
      return false;
    }
    return true;
  };
  
  const validateVehicleInfo = () => {
    if (!vehicleForm.make.trim()) {
      Alert.alert('Required', 'Please enter vehicle make');
      return false;
    }
    if (!vehicleForm.model.trim()) {
      Alert.alert('Required', 'Please enter vehicle model');
      return false;
    }
    if (!vehicleForm.year.trim()) {
      Alert.alert('Required', 'Please enter vehicle year');
      return false;
    }
    if (!vehicleForm.plate.trim()) {
      Alert.alert('Required', 'Please enter license plate');
      return false;
    }
    return true;
  };
  
  const validateDocuments = () => {
    const allUploaded = Object.values(documents).every(Boolean);
    if (!allUploaded) {
      Alert.alert('Required', 'Please upload all required documents');
      return false;
    }
    return true;
  };
  
  // Navigation
  const handleNext = async () => {
    switch (currentStep) {
      case 'personal':
        if (validatePersonalInfo()) {
          updatePersonalInfo(personalForm);
          setCurrentStep('vehicle');
          setOnboardingStep('vehicle');
        }
        break;
      case 'vehicle':
        if (validateVehicleInfo()) {
          updateVehicleInfo(vehicleForm);
          setCurrentStep('documents');
          setOnboardingStep('documents');
        }
        break;
      case 'documents': {
        if (!validateDocuments()) break;
        const { driverLicense, vehicleRegistration, insurance, profilePhoto } = documents;
        if (!driverLicense || !vehicleRegistration || !insurance || !profilePhoto) break;
        updateDocuments(documents);

        // Single insert with everything accumulated across the steps —
        // personal info, vehicle info, uploaded document urls/keys.
        // account_status starts as 'pending' (a table default; never sent
        // from the client). On failure we stay on this step.
        setSubmitting(true);
        const { account, errorMessage } = await createDriverProfile({
          firstName: personalForm.firstName.trim(),
          lastName: personalForm.lastName.trim(),
          email: personalForm.email.trim(),
          phone: personalForm.phone.trim(),
          vehicleMake: vehicleForm.make.trim(),
          vehicleModel: vehicleForm.model.trim(),
          vehicleYear: vehicleForm.year.trim(),
          licensePlate: vehicleForm.plate.trim(),
          vehicleType: vehicleForm.vehicleType,
          documents: { driverLicense, vehicleRegistration, insurance, profilePhoto },
        });
        setSubmitting(false);

        if (errorMessage) {
          Alert.alert('Could not submit your application', errorMessage);
          return;
        }

        if (account) setDriverAccount(account);
        setCurrentStep('complete');
        setOnboardingStep('complete');
        completeOnboarding();
        break;
      }
      case 'complete':
        // The application is pending admin review — never switch the user
        // into driver mode from here.
        router.replace('/');
        break;
    }
  };
  
  const handleBack = () => {
    switch (currentStep) {
      case 'vehicle':
        setCurrentStep('personal');
        setOnboardingStep('personal');
        break;
      case 'documents':
        setCurrentStep('vehicle');
        setOnboardingStep('vehicle');
        break;
      default:
        router.back();
    }
  };
  
  // Picks a real file and uploads it to InsForge storage. The three
  // verification documents accept images or PDFs; the profile photo goes
  // through the photo library with cropping.
  const handleDocumentUpload = async (docType: DriverDocumentType) => {
    if (uploadingDoc) return;

    let localUri: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;

    if (docType === 'profilePhoto') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to upload a profile photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      localUri = result.assets[0].uri;
      fileName = result.assets[0].fileName ?? null;
      mimeType = result.assets[0].mimeType ?? null;
    } else {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      localUri = result.assets[0].uri;
      fileName = result.assets[0].name ?? null;
      mimeType = result.assets[0].mimeType ?? null;
    }

    setUploadingDoc(docType);
    const { document, errorMessage, requiresReauth } = await uploadDriverDocument(docType, localUri, {
      fileName,
      mimeType,
    });
    setUploadingDoc(null);

    if (requiresReauth) {
      Alert.alert(
        'Session expired',
        errorMessage ?? 'Please sign in again to continue.',
        [
          {
            text: 'OK',
            onPress: async () => {
              try {
                await insforge.auth.signOut();
              } finally {
                insforge.setAccessToken(null);
                await useAuthStore.getState().setAuthed(false);
              }
            },
          },
        ]
      );
      return;
    }

    if (errorMessage || !document) {
      Alert.alert('Upload failed', errorMessage ?? 'Please try again.');
      return;
    }

    setDocuments((prev) => ({ ...prev, [docType]: document }));
  };
  
  // Vehicle types
  const vehicleTypes: { id: VehicleType; label: string }[] = [
    { id: 'economy', label: 'Economy' },
    { id: 'comfort', label: 'Comfort' },
    { id: 'bike', label: 'Bike' },
    { id: 'truck', label: 'Truck' },
  ];
  
  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />
      
      {/* Progress indicators with safe area */}
      <SafeAreaView edges={['top']} className="bg-background">
        <View className="px-5 py-4">
          <View className="flex-row items-center justify-between">
            {steps.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = step.key === currentStep;
              
              return (
                <React.Fragment key={step.key}>
                  <View className="items-center">
                    <View 
                      className={`w-10 h-10 rounded-full items-center justify-center ${
                        isCompleted 
                          ? 'bg-success' 
                          : isCurrent 
                          ? 'bg-accent' 
                          : 'bg-gray-200'
                      }`}
                    >
                      {isCompleted ? (
                        <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                      ) : (
                        <Ionicons 
                          name={step.icon} 
                          size={20} 
                          color={isCurrent ? '#FFFFFF' : '#7B8387'} 
                        />
                      )}
                    </View>
                    <Text 
                      className={`text-xs mt-1 ${
                        isCurrent ? 'text-accent font-semibold' : 'text-secondary'
                      }`}
                    >
                      {step.label}
                    </Text>
                  </View>
                  
                  {index < steps.length - 1 && (
                    <View 
                      className={`flex-1 h-0.5 mx-2 ${
                        index < currentStepIndex ? 'bg-success' : 'bg-gray-200'
                      }`} 
                    />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
      
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* Personal Info Step */}
        {currentStep === 'personal' && (
          <View>
            <Text className="text-primary font-bold text-2xl mb-2">
              Personal Information
            </Text>
            <Text className="text-secondary mb-6">
              Tell us about yourself to get started
            </Text>
            
            <Card variant="default" padding="lg" radius="xl">
              <Input
                label="First Name"
                placeholder="Enter your first name"
                value={personalForm.firstName}
                onChangeText={(text) => setPersonalForm((p) => ({ ...p, firstName: text }))}
                leftIcon="person-outline"
              />

              <View className="h-4" />

              <Input
                label="Last Name"
                placeholder="Enter your last name"
                value={personalForm.lastName}
                onChangeText={(text) => setPersonalForm((p) => ({ ...p, lastName: text }))}
                leftIcon="person-outline"
              />

              <View className="h-4" />

              <Input
                label="Email"
                placeholder="Enter your email"
                value={personalForm.email}
                onChangeText={(text) => setPersonalForm((p) => ({ ...p, email: text }))}
                leftIcon="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View className="h-4" />

              <Input
                label="Phone Number"
                placeholder="Enter your phone number"
                value={personalForm.phone}
                onChangeText={(text) => setPersonalForm((p) => ({ ...p, phone: text }))}
                leftIcon="call-outline"
                keyboardType="phone-pad"
              />

              <View className="h-4" />

              <Input
                label="Date of Birth"
                placeholder="DD/MM/YYYY"
                value={personalForm.dateOfBirth}
                onChangeText={(text) => setPersonalForm((p) => ({ ...p, dateOfBirth: text }))}
                leftIcon="calendar-outline"
              />
              
              <View className="h-4" />
              
              <Input
                label="National ID Number"
                placeholder="Enter your NRC number"
                value={personalForm.nationalId}
                onChangeText={(text) => setPersonalForm((p) => ({ ...p, nationalId: text }))}
                leftIcon="card-outline"
              />
              
              <View className="h-4" />
              
              <Input
                label="Residential Address"
                placeholder="Enter your address"
                value={personalForm.address}
                onChangeText={(text) => setPersonalForm((p) => ({ ...p, address: text }))}
                leftIcon="location-outline"
                multiline
              />
            </Card>
          </View>
        )}
        
        {/* Vehicle Info Step */}
        {currentStep === 'vehicle' && (
          <View>
            <Text className="text-primary font-bold text-2xl mb-2">
              Vehicle Information
            </Text>
            <Text className="text-secondary mb-6">
              Tell us about your vehicle
            </Text>
            
            <Card variant="default" padding="lg" radius="xl">
              <Text className="text-primary font-medium mb-3">Vehicle Type</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {vehicleTypes.map((type) => (
                  <Chip
                    key={type.id}
                    label={type.label}
                    selected={vehicleForm.vehicleType === type.id}
                    onPress={() => setVehicleForm((p) => ({ ...p, vehicleType: type.id }))}
                  />
                ))}
              </View>
              
              <Input
                label="Make"
                placeholder="e.g., Toyota"
                value={vehicleForm.make}
                onChangeText={(text) => setVehicleForm((p) => ({ ...p, make: text }))}
                leftIcon="car-outline"
              />
              
              <View className="h-4" />
              
              <Input
                label="Model"
                placeholder="e.g., Corolla"
                value={vehicleForm.model}
                onChangeText={(text) => setVehicleForm((p) => ({ ...p, model: text }))}
              />
              
              <View className="h-4" />
              
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    label="Year"
                    placeholder="e.g., 2020"
                    value={vehicleForm.year}
                    onChangeText={(text) => setVehicleForm((p) => ({ ...p, year: text }))}
                    keyboardType="number-pad"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label="Color"
                    placeholder="e.g., Silver"
                    value={vehicleForm.color}
                    onChangeText={(text) => setVehicleForm((p) => ({ ...p, color: text }))}
                  />
                </View>
              </View>
              
              <View className="h-4" />
              
              <Input
                label="License Plate"
                placeholder="e.g., ABZ 1234"
                value={vehicleForm.plate}
                onChangeText={(text) => setVehicleForm((p) => ({ ...p, plate: text }))}
                autoCapitalize="characters"
              />
            </Card>
          </View>
        )}
        
        {/* Documents Step */}
        {currentStep === 'documents' && (
          <View>
            <Text className="text-primary font-bold text-2xl mb-2">
              Required Documents
            </Text>
            <Text className="text-secondary mb-6">
              Upload the following documents to verify your profile
            </Text>
            
            <Card variant="default" padding="lg" radius="xl">
              {(
                [
                  { key: 'driverLicense', label: 'Driver\'s License', icon: 'card' },
                  { key: 'vehicleRegistration', label: 'Vehicle Registration', icon: 'document-text' },
                  { key: 'insurance', label: 'Insurance Certificate', icon: 'shield-checkmark' },
                  { key: 'profilePhoto', label: 'Profile Photo', icon: 'camera' },
                ] as { key: DriverDocumentType; label: string; icon: string }[]
              ).map((doc, index) => {
                const uploaded = documents[doc.key];
                const isReusedPhoto =
                  doc.key === 'profilePhoto' && !!uploaded && uploaded.key === null;

                return (
                  <View key={doc.key}>
                    <View className="flex-row items-center py-4">
                      <View
                        className={`w-12 h-12 rounded-full items-center justify-center ${
                          uploaded ? 'bg-success/10' : 'bg-gray-100'
                        }`}
                      >
                        <Ionicons
                          name={doc.icon as keyof typeof Ionicons.glyphMap}
                          size={24}
                          color={uploaded ? '#00D26A' : '#7B8387'}
                        />
                      </View>

                      <View className="ml-4 flex-1">
                        <Text className="text-primary font-medium">
                          {doc.label}
                        </Text>
                        <Text className="text-secondary text-sm">
                          {uploadingDoc === doc.key
                            ? 'Uploading…'
                            : isReusedPhoto
                            ? 'Using your profile photo'
                            : uploaded
                            ? 'Uploaded'
                            : 'Required'}
                        </Text>
                      </View>

                      <Button
                        variant={uploaded ? 'ghost' : 'outline'}
                        size="sm"
                        onPress={() => handleDocumentUpload(doc.key)}
                        loading={uploadingDoc === doc.key}
                        disabled={uploadingDoc !== null}
                      >
                        {uploaded ? 'Change' : 'Upload'}
                      </Button>
                    </View>

                    {index < 3 && <View className="h-px bg-gray-100" />}
                  </View>
                );
              })}
            </Card>
          </View>
        )}
        
        {/* Complete Step */}
        {currentStep === 'complete' && (
          <View className="items-center py-12">
            <View className="w-24 h-24 rounded-full bg-success items-center justify-center mb-6">
              <Ionicons name="checkmark" size={48} color="#FFFFFF" />
            </View>
            
            <Text className="text-primary font-bold text-2xl text-center mb-2">
              Application Submitted
            </Text>
            <Text className="text-secondary text-center px-8 mb-8">
              Your application is under review. You will be notified once the admin has reviewed
              your documents.
            </Text>
            
            <Card variant="default" padding="md" radius="xl" className="w-full">
              <View className="flex-row items-center">
                <Ionicons name="car" size={32} color="#26344F" />
                <View className="ml-4">
                  <Text className="text-primary font-semibold">
                    {vehicleForm.color} {vehicleForm.make} {vehicleForm.model}
                  </Text>
                  <Text className="text-secondary">
                    {vehicleForm.plate} • {vehicleForm.vehicleType}
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        )}
        
        <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* Bottom buttons */}
      <SafeAreaView edges={['bottom']} className="bg-white border-t border-gray-100">
        <View className="flex-row gap-3 px-5 py-4">
          {currentStep !== 'complete' && (
            <Button
              variant="outline"
              onPress={handleBack}
              className="flex-1"
            >
              {currentStep === 'personal' ? 'Cancel' : 'Back'}
            </Button>
          )}
          
          <Button
            variant="accent"
            onPress={handleNext}
            className="flex-1"
            loading={submitting}
            disabled={submitting || uploadingDoc !== null}
          >
            {currentStep === 'complete'
              ? 'Back to Home'
              : currentStep === 'documents'
              ? 'Submit Application'
              : 'Continue'}
          </Button>
        </View>
      </SafeAreaView>
    </View>
  );
}

